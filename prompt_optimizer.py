#!/usr/bin/env python3
"""
Prompt Optimization Pipeline for Variable Extraction

Modular design:
  - optimize: Uses minimax to improve prompts based on Qwen 4B best practices.
              Reads from variables.json, saves optimized prompts back.
              No ground truth data required.
  - evaluate: Tests prompts against ground truth CSV samples.
              Requires prediction + ground truth CSV files.

Configuration is read from the environment (typically via a root ``.env`` file):
  FIREWORKS_API_KEY (required for API calls),
  FIREWORKS_CHAT_COMPLETIONS_URL, FIREWORKS_OPTIMIZER_MODEL, FIREWORKS_EVALUATION_MODEL,
  PROMPT_OPTIMIZER_* path overrides — see ``.env.example``.
"""
import csv
import json
import logging
import os
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


# ── Env-driven configuration ────────────────────────────────────────────

_DEFAULT_FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions"
_DEFAULT_OPTIMIZER_MODEL = "accounts/fireworks/models/minimax-m2p5"
_DEFAULT_EVAL_MODEL = "accounts/fireworks/models/qwen2p5-7b-instruct"


@dataclass(frozen=True)
class FireworksPipelineConfig:
    """Inference and file paths for this script (from environment)."""

    fireworks_chat_completions_url: str
    optimizer_model: str
    evaluation_model: str
    optimizer_timeout_sec: float
    evaluation_timeout_sec: float
    optimizer_max_tokens: int
    variables_json: str
    output_dir: str
    ground_truth_csv: str
    predictions_csv: str
    verbose_http: bool


def _env_bool(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    if v is None or not v.strip():
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    return float(str(raw).strip())


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    return int(str(raw).strip())


def _validate_fireworks_chat_url(url: str) -> str:
    parsed = urlparse(url)
    allow_insecure = _env_bool("FIREWORKS_ALLOW_INSECURE_HTTP", default=False)
    if not parsed.netloc:
        raise ValueError("FIREWORKS_CHAT_COMPLETIONS_URL must include a host.")
    if parsed.scheme == "https":
        return url
    if parsed.scheme == "http" and allow_insecure:
        return url
    raise ValueError(
        "FIREWORKS_CHAT_COMPLETIONS_URL must use https:// "
        "(set FIREWORKS_ALLOW_INSECURE_HTTP=1 only if you know you need HTTP)."
    )


@lru_cache(maxsize=1)
def get_pipeline_config() -> FireworksPipelineConfig:
    url_raw = (os.environ.get("FIREWORKS_CHAT_COMPLETIONS_URL") or "").strip() or _DEFAULT_FIREWORKS_URL
    url = _validate_fireworks_chat_url(url_raw)

    opt_model = (
        (os.environ.get("FIREWORKS_OPTIMIZER_MODEL") or "").strip() or _DEFAULT_OPTIMIZER_MODEL
    )
    eval_model = (
        (os.environ.get("FIREWORKS_EVALUATION_MODEL") or "").strip() or _DEFAULT_EVAL_MODEL
    )

    return FireworksPipelineConfig(
        fireworks_chat_completions_url=url,
        optimizer_model=opt_model,
        evaluation_model=eval_model,
        optimizer_timeout_sec=_env_float("FIREWORKS_OPTIMIZER_TIMEOUT_SECONDS", 120.0),
        evaluation_timeout_sec=_env_float("FIREWORKS_EVALUATION_TIMEOUT_SECONDS", 60.0),
        optimizer_max_tokens=max(256, _env_int("FIREWORKS_OPTIMIZER_MAX_TOKENS", 16384)),
        variables_json=(os.environ.get("PROMPT_OPTIMIZER_VARIABLES_JSON") or "variables.json").strip(),
        output_dir=(os.environ.get("PROMPT_OPTIMIZER_OUTPUT_DIR") or "optimized_prompts").strip(),
        ground_truth_csv=(
            os.environ.get("PROMPT_OPTIMIZER_GROUND_TRUTH_CSV") or ""
        ).strip()
        or ".uploads/ground_truth.csv",
        predictions_csv=(
            (os.environ.get("PROMPT_OPTIMIZER_PREDICTIONS_CSV") or "results.csv").strip()
        ),
        verbose_http=_env_bool("PROMPT_OPTIMIZER_VERBOSE_HTTP", default=False),
    )


def fireworks_api_key() -> str:
    key = (os.environ.get("FIREWORKS_API_KEY") or "").strip()
    if not key:
        raise RuntimeError(
            "FIREWORKS_API_KEY is not set. Copy .env.example to .env "
            "or export FIREWORKS_API_KEY in your environment."
        )
    return key


def fireworks_auth_headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {fireworks_api_key()}",
        "Content-Type": "application/json",
    }


def _log_response_error(where: str, response: Optional[requests.Response]) -> None:
    if response is None:
        logger.warning("%s: request failed with no response", where)
        return
    logger.warning("%s: HTTP status %s", where, response.status_code)
    if get_pipeline_config().verbose_http:
        body_len = len(response.content or b"")
        logger.warning("%s: response body length %s bytes", where, body_len)


# ────────────────────────────────────────────────────────────────────────

# Qwen 4B Best Practices (from research)
QWEN_BEST_PRACTICES = """
Based on research for Qwen 4B models:

1. PROMPT STRUCTURE:
   - Use clear system/user message separation
   - Include "JSON" keyword for structured output
   - Set response_format to json_object
   - Keep prompts under 32K tokens

2. PARAMETER SETTINGS:
   - Temperature: 0.3-0.5 for structured tasks
   - Top-P: 0.9
   - Presence Penalty: 1.5 (reduces repetition)

3. JSON OUTPUT:
   - Always specify "return only valid JSON"
   - Avoid markdown formatting
   - Use null for unclear information
   - Include step-by-step reasoning

4. BOOLEAN CLASSIFICATION:
   - Provide clear criteria for true/false
   - Include 2-3 few-shot examples
   - Use evidence-based reasoning
   - Structure: reasoning first, then conclusion

5. AVOID:
   - Overly long contexts
   - Ambiguous instructions
   - Multiple output formats in one prompt
   - Temperature above 0.7 for structured tasks
"""


# ── Shared utilities ────────────────────────────────────────────────────

def load_variables(path: Optional[str] = None) -> List[Dict]:
    """Load all variables from variables.json (or ``PROMPT_OPTIMIZER_VARIABLES_JSON``)."""
    path = path or get_pipeline_config().variables_json
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_variables(variables: List[Dict], path: Optional[str] = None):
    """Save variables back to variables.json (or configured path)."""
    path = path or get_pipeline_config().variables_json
    with open(path, "w", encoding="utf-8") as f:
        json.dump(variables, f, indent=4, ensure_ascii=False)


def call_minimax(messages: List[Dict], temperature: float = 0.7, max_tokens: Optional[int] = None) -> str:
    """Call the configured optimizer model (e.g. minimax) for prompt optimization."""
    cfg = get_pipeline_config()
    payload = {
        "model": cfg.optimizer_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens if max_tokens is not None else cfg.optimizer_max_tokens,
        "response_format": {"type": "json_object"},
    }
    headers = fireworks_auth_headers()

    try:
        response = requests.post(
            cfg.fireworks_chat_completions_url,
            headers=headers,
            json=payload,
            timeout=cfg.optimizer_timeout_sec,
            verify=True,
        )
    except requests.RequestException as exc:
        logger.warning("Fireworks optimizer request failed: %s", type(exc).__name__)
        raise RuntimeError("Fireworks inference request failed (network or timeout).") from exc

    if not response.ok:
        _log_response_error("call_minimax", response)
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


# ── Optimize module ─────────────────────────────────────────────────────

def optimize_prompt_for_variable(var_name: str, description: str) -> Dict:
    """Use minimax to optimize a single variable's prompt/description.

    Returns dict with optimized_description, improvements_made, rationale.
    """
    optimization_prompt = f"""You are a prompt engineering expert specializing in Qwen 4B model optimization for call center transcript analysis.

TASK: Optimize the following variable description/prompt for the variable '{var_name}'.
This description is used as the system prompt when Qwen 4B analyzes call transcripts to produce a boolean classification.

CURRENT DESCRIPTION/PROMPT:
{description}

QWEN 4B BEST PRACTICES TO FOLLOW:
{QWEN_BEST_PRACTICES}

REQUIREMENTS:
1. Improve clarity and accuracy for boolean classification on call center transcripts
2. Follow Qwen 4B best practices exactly
3. Keep the variable's original intent and business logic intact — do NOT change what is being detected
4. Structure the prompt with: clear definition, step-by-step evaluation instructions, explicit true/false criteria, and 2-3 few-shot examples
5. Optimize for JSON structured output (keys: "reason" and "value")
6. Use reasoning-first structure: the model should reason step-by-step before concluding
7. Add explicit "Return only valid JSON" instruction
8. Remove any ambiguity in edge cases
9. Keep the prompt concise — remove redundancy but preserve all decision logic

Return the result in JSON format:
{{
    "optimized_description": "the full improved prompt/description text",
    "improvements_made": ["list of specific improvements"],
    "rationale": "explanation of why these changes will improve accuracy"
}}"""

    messages = [
        {"role": "system", "content": "You are a prompt engineering expert specializing in optimizing prompts for small language models. Return results in JSON format."},
        {"role": "user", "content": optimization_prompt}
    ]

    response = call_minimax(messages, temperature=0.5)
    return json.loads(response)


def run_optimize(variable_filter: Optional[str] = None):
    """Run optimization on all (or filtered) variables and save back to variables.json.

    Args:
        variable_filter: If provided, only optimize variables whose name contains this string.
                         Use "all" or None to optimize everything.
    """
    variables = load_variables()
    total = len(variables)
    optimized_count = 0
    failed = []

    # Filter variables if requested
    if variable_filter and variable_filter.lower() != "all":
        indices = [i for i, v in enumerate(variables) if variable_filter.lower() in v["var_name"].lower()]
        if not indices:
            print(f"No variables matching '{variable_filter}' found.")
            return
        print(f"Found {len(indices)} variable(s) matching '{variable_filter}'")
    else:
        indices = list(range(total))
        print(f"Optimizing all {total} variables")

    print("=" * 60)

    out_dir = get_pipeline_config().output_dir
    os.makedirs(out_dir, exist_ok=True)

    for count, idx in enumerate(indices, 1):
        var = variables[idx]
        var_name = var["var_name"]
        original_desc = var["description"]

        print(f"\n[{count}/{len(indices)}] Optimizing: {var_name}")
        print(f"  Original length: {len(original_desc)} chars")

        try:
            result = optimize_prompt_for_variable(var_name, original_desc)
            optimized_desc = result["optimized_description"]
            improvements = result.get("improvements_made", [])
            rationale = result.get("rationale", "")

            # Update in-place
            variables[idx]["description"] = optimized_desc

            # Save individual result
            individual_path = os.path.join(out_dir, f"{var_name}_optimization.json")
            with open(individual_path, "w", encoding="utf-8") as f:
                json.dump({
                    "variable": var_name,
                    "original_description": original_desc,
                    "optimized_description": optimized_desc,
                    "improvements_made": improvements,
                    "rationale": rationale,
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
                }, f, indent=2, ensure_ascii=False)

            optimized_count += 1
            print(f"  Optimized length: {len(optimized_desc)} chars")
            print(f"  Improvements: {improvements}")

        except Exception as e:
            print(f"  FAILED: {e}")
            failed.append(var_name)

        # Rate limiting between API calls
        if count < len(indices):
            time.sleep(1)

    # Save all updated variables back
    save_variables(variables)

    print("\n" + "=" * 60)
    print(f"DONE: {optimized_count}/{len(indices)} variables optimized")
    vpath = get_pipeline_config().variables_json
    print(f"Saved to: {vpath}")
    print(f"Individual results in: {get_pipeline_config().output_dir}/")
    if failed:
        print(f"Failed ({len(failed)}): {failed}")


# ── Evaluate module ─────────────────────────────────────────────────────

@dataclass
class TestSample:
    transcript: str
    ground_truth_value: bool
    ground_truth_reason: str
    index: int


def load_test_samples(variable: str, num_true: int = 10, num_false: int = 10) -> List[TestSample]:
    """Load test samples with known ground truth for a variable."""
    print(f"Loading test samples for {variable}...")
    cfg = get_pipeline_config()

    with open(cfg.predictions_csv, "r", encoding="utf-8") as f:
        predictions = list(csv.DictReader(f))

    with open(cfg.ground_truth_csv, "r", encoding="utf-8") as f:
        ground_truth = list(csv.DictReader(f))

    true_samples = []
    false_samples = []

    for i, (pred, truth) in enumerate(zip(predictions, ground_truth)):
        gt_value = truth.get(f"{variable}_value", "").strip().upper()
        gt_reason = truth.get(f"{variable}_reason", "")
        transcript = pred.get("transcript", "")

        if not transcript.strip() or gt_value not in ["TRUE", "FALSE"]:
            continue

        sample = TestSample(
            transcript=transcript,
            ground_truth_value=gt_value == "TRUE",
            ground_truth_reason=gt_reason,
            index=i
        )

        if gt_value == "TRUE" and len(true_samples) < num_true:
            true_samples.append(sample)
        elif gt_value == "FALSE" and len(false_samples) < num_false:
            false_samples.append(sample)

        if len(true_samples) >= num_true and len(false_samples) >= num_false:
            break

    samples = true_samples + false_samples
    print(f"  Found {len(true_samples)} TRUE and {len(false_samples)} FALSE samples")
    return samples


def call_qwen(system_prompt: str, transcript: str) -> Dict:
    """Test a prompt with the configured evaluation model (e.g. Qwen)."""
    cfg = get_pipeline_config()
    final_prompt = system_prompt.replace("{transcript}", transcript)

    payload = {
        "model": cfg.evaluation_model,
        "messages": [{"role": "user", "content": final_prompt}],
        "temperature": 0.3,
        "top_p": 0.9,
        "presence_penalty": 1.5,
        "response_format": {"type": "json_object"},
    }
    headers = fireworks_auth_headers()

    response = None
    try:
        response = requests.post(
            cfg.fireworks_chat_completions_url,
            headers=headers,
            json=payload,
            timeout=cfg.evaluation_timeout_sec,
            verify=True,
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()
    except requests.HTTPError:
        _log_response_error("call_qwen", response)
        logger.debug("call_qwen HTTP error", exc_info=True)
        return {
            "success": False,
            "value": False,
            "reason": "API_ERROR",
            "raw_response": "",
        }
    except requests.RequestException:
        logger.debug("call_qwen network error", exc_info=True)
        return {
            "success": False,
            "value": False,
            "reason": "API_ERROR",
            "raw_response": "",
        }
    except (json.JSONDecodeError, KeyError, IndexError, TypeError):
        logger.debug("call_qwen invalid HTTP JSON from API", exc_info=True)
        return {
            "success": False,
            "value": False,
            "reason": "API_ERROR",
            "raw_response": "",
        }

    try:
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1]) if len(lines) > 2 else content
            content = content.replace("```json", "").replace("```", "").strip()

        if not content.endswith("}") and content.count("{") > content.count("}"):
            content += "}"

        result = json.loads(content)
        return {
            "success": True,
            "value": result.get("value", False),
            "reason": result.get("reason", ""),
            "raw_response": content,
        }
    except json.JSONDecodeError:
        return {
            "success": False,
            "value": False,
            "reason": "JSON_PARSE_ERROR",
            "raw_response": content,
        }


def build_eval_prompt(variable: str) -> str:
    """Build evaluation prompt from variables.json for a given variable."""
    variables = load_variables()
    var_definition = ""
    for var in variables:
        if var["var_name"] == variable:
            var_definition = var["description"]
            break

    if not var_definition:
        raise ValueError(
            f"Variable '{variable}' not found in {get_pipeline_config().variables_json}"
        )

    return f"""You are an expert call transcript analyzer. Analyze the following transcript and determine if the specified variable applies.

Variable to Evaluate: {variable}

{var_definition}

Transcript:
{{transcript}}

Instructions:
1. Read the transcript carefully
2. Apply the variable definition exactly as specified
3. Look for explicit evidence that supports your conclusion
4. Provide clear reasoning based on the transcript content
5. Return result in JSON format only

Return only valid JSON in this exact format:
{{"reason": "your detailed reasoning here", "value": true}}
or
{{"reason": "your detailed reasoning here", "value": false}}"""


def test_prompt(prompt: str, variable: str, samples: List[TestSample]) -> Tuple[float, List[Dict]]:
    """Test a prompt on samples and return accuracy + detailed results."""
    correct = 0
    successful_tests = 0
    results = []

    print(f"  Testing prompt on {len(samples)} samples...")

    for i, sample in enumerate(samples):
        print(f"    {i+1}/{len(samples)}", end=" ", flush=True)
        result = call_qwen(prompt, sample.transcript)

        if result["success"]:
            predicted_value = result["value"]
            is_correct = predicted_value == sample.ground_truth_value
            successful_tests += 1
            if is_correct:
                correct += 1
                print("OK", end="", flush=True)
            else:
                print("FAIL", end="", flush=True)
        else:
            print("ERR", end="", flush=True)
            is_correct = False
            predicted_value = False

        results.append({
            "sample_index": sample.index,
            "predicted_value": predicted_value,
            "ground_truth_value": sample.ground_truth_value,
            "correct": is_correct,
            "predicted_reason": result["reason"],
            "ground_truth_reason": sample.ground_truth_reason,
            "api_success": result["success"],
        })

        time.sleep(0.5)

    print()
    accuracy = correct / successful_tests if successful_tests > 0 else 0
    print(f"  Accuracy: {accuracy:.1%} ({correct}/{successful_tests})")
    return accuracy, results


def run_evaluate(variable: str, num_samples: int = 20):
    """Run evaluation for a single variable against ground truth."""
    print(f"\nEvaluating variable: {variable}")
    print("=" * 60)

    samples = load_test_samples(variable, num_samples // 2, num_samples // 2)
    if len(samples) < 4:
        print(f"Not enough samples for {variable}. Found {len(samples)}, need at least 4.")
        return

    prompt = build_eval_prompt(variable)
    print(f"Prompt loaded ({len(prompt)} chars)")

    accuracy, results = test_prompt(prompt, variable, samples)

    out_dir = get_pipeline_config().output_dir
    os.makedirs(out_dir, exist_ok=True)
    eval_path = os.path.join(out_dir, f"{variable}_evaluation.json")
    with open(eval_path, "w", encoding="utf-8") as f:
        json.dump({
            "variable": variable,
            "accuracy": accuracy,
            "num_samples": len(samples),
            "results": results,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }, f, indent=2)

    print(f"Results saved to {eval_path}")


# ── CLI ─────────────────────────────────────────────────────────────────

def main():
    import argparse

    if not logging.root.handlers:
        level = logging.DEBUG if _env_bool("PROMPT_OPTIMIZER_DEBUG") else logging.WARNING
        logging.basicConfig(level=level, format="%(levelname)s %(name)s: %(message)s")

    parser = argparse.ArgumentParser(
        description="Prompt optimization and evaluation pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python prompt_optimizer.py optimize                    # Optimize all variables
  python prompt_optimizer.py optimize --filter sentiment # Optimize matching variables
  python prompt_optimizer.py evaluate mid_call_disconnection  # Evaluate one variable
        """
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Optimize subcommand
    opt_parser = subparsers.add_parser("optimize", help="Optimize prompts using minimax (no data files needed)")
    opt_parser.add_argument("--filter", type=str, default="all",
                            help="Filter variables by name substring, or 'all' (default: all)")

    # Evaluate subcommand
    eval_parser = subparsers.add_parser("evaluate", help="Evaluate prompts against ground truth CSVs")
    eval_parser.add_argument("variable", help="Variable name to evaluate")
    eval_parser.add_argument("--samples", type=int, default=20, help="Number of test samples (default: 20)")

    args = parser.parse_args()

    if args.command == "optimize":
        run_optimize(args.filter)
    elif args.command == "evaluate":
        run_evaluate(args.variable, args.samples)


if __name__ == "__main__":
    exit(main() or 0)
