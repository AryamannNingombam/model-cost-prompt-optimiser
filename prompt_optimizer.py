#!/usr/bin/env python3
"""
Prompt Optimization Pipeline for Variable Extraction

Uses minimax model to optimize prompts based on Qwen 4B best practices,
tests on ground truth samples, and iterates for better performance.
"""
import csv
import json
import requests
import time
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass

# ── Config ──────────────────────────────────────────────────────────────
GROUND_TRUTH_CSV = ".uploads/260507132957-Interaction Report May 6 2026.csv"
PREDICTIONS_CSV = "results.csv"
OPTIMIZED_PROMPTS_DIR = "optimized_prompts"

FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions"
QWEN_MODEL = "accounts/aryamann-ii2ajvi2ui7/deployments/gb1zhixe"
MINIMAX_MODEL = "accounts/fireworks/models/minimax-m2p5"
API_KEY = "fw_HvHpL7Xv8J9nBrW8w199U3"
# ────────────────────────────────────────────────────────────────────────

@dataclass
class TestSample:
    transcript: str
    ground_truth_value: bool
    ground_truth_reason: str
    index: int

@dataclass
class OptimizationResult:
    variable: str
    original_accuracy: float
    optimized_accuracy: float
    original_prompt: str
    optimized_prompt: str
    test_results: List[Dict]

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

def load_test_samples(variable: str, num_true: int = 10, num_false: int = 10) -> List[TestSample]:
    """Load test samples with known ground truth for a variable."""
    print(f"🔍 Loading test samples for {variable}...")

    # Load merged data
    with open(PREDICTIONS_CSV, 'r', encoding='utf-8') as f:
        predictions = list(csv.DictReader(f))

    with open(GROUND_TRUTH_CSV, 'r', encoding='utf-8') as f:
        ground_truth = list(csv.DictReader(f))

    samples = []
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
    print(f"   📊 Found {len(true_samples)} TRUE and {len(false_samples)} FALSE samples")
    return samples

def call_minimax(messages: List[Dict], temperature: float = 0.7) -> str:
    """Call minimax model for prompt optimization."""
    payload = {
        "model": MINIMAX_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 2048,
        "response_format": {"type": "json_object"}
    }
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    response = requests.post(FIREWORKS_URL, headers=headers, json=payload, timeout=60)
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]

def call_qwen(system_prompt: str, transcript: str) -> Dict:
    """Test a prompt with Qwen model."""
    # Manual string replacement to avoid format conflicts
    final_prompt = system_prompt.replace("{transcript}", transcript)

    payload = {
        "model": QWEN_MODEL,
        "messages": [{"role": "user", "content": final_prompt}],
        "temperature": 0.3,
        "top_p": 0.9,
        "presence_penalty": 1.5,
        "max_tokens": 4000,
        "response_format": {"type": "json_object"}
    }
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(FIREWORKS_URL, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()

        # Clean and parse JSON response
        try:
            # Strip markdown formatting if present
            content = content.strip()
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if len(lines) > 2 else content
                content = content.replace("```json", "").replace("```", "").strip()

            # Try to fix common JSON issues
            if not content.endswith('}') and content.count('{') > content.count('}'):
                content += '}'

            result = json.loads(content)
            return {
                "success": True,
                "value": result.get("value", False),
                "reason": result.get("reason", ""),
                "raw_response": content
            }
        except json.JSONDecodeError as e:
            print(f"\n   ❌ JSON Parse Error: {e}")
            print(f"   Raw response: {content[:200]}...")
            return {
                "success": False,
                "value": False,
                "reason": "JSON_PARSE_ERROR",
                "raw_response": content
            }
    except Exception as e:
        return {
            "success": False,
            "value": False,
            "reason": f"API_ERROR: {str(e)}",
            "raw_response": ""
        }

def get_current_prompt(variable: str) -> str:
    """Get current prompt template for a variable."""
    # Load variable definition from variables.json
    try:
        with open("variables.json", "r") as f:
            variables = json.load(f)

        var_definition = ""
        for var in variables:
            if var["var_name"] == variable:
                var_definition = var["description"]
                break

        if not var_definition:
            var_definition = f"Variable {variable} definition not found."

        current_prompt = f"""
You are an expert call transcript analyzer. Analyze the following transcript and determine if the specified variable applies.

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
{{"reason": "your detailed reasoning here", "value": false}}
"""
        return current_prompt.strip()

    except FileNotFoundError:
        return f"""
Analyze this call transcript for the variable '{variable}'.

Transcript: {{transcript}}

Return only JSON: {{"reason": "your reasoning", "value": true/false}}
"""

def optimize_prompt(variable: str, current_prompt: str, test_samples: List[TestSample]) -> str:
    """Use minimax to optimize the prompt based on best practices."""
    print(f"🤖 Optimizing prompt for {variable} using minimax...")

    # Create sample failures for context
    sample_failures = []
    for sample in test_samples[:3]:  # Show a few examples
        sample_failures.append({
            "transcript_preview": sample.transcript[:200] + "...",
            "ground_truth": sample.ground_truth_value,
            "ground_truth_reason": sample.ground_truth_reason[:100] + "..." if len(sample.ground_truth_reason) > 100 else sample.ground_truth_reason
        })

    optimization_prompt = f"""
You are a prompt engineering expert specializing in Qwen 4B model optimization for call center transcript analysis.

TASK: Optimize the following prompt for the variable '{variable}' to improve accuracy on call center transcripts.

CURRENT PROMPT:
{current_prompt}

QWEN 4B BEST PRACTICES TO FOLLOW:
{QWEN_BEST_PRACTICES}

SAMPLE TEST CASES:
{json.dumps(sample_failures, indent=2)}

REQUIREMENTS:
1. Improve accuracy for boolean classification
2. Follow Qwen 4B best practices exactly
3. Include clear variable definition
4. Add 2-3 few-shot examples if helpful
5. Optimize for JSON structured output
6. Keep reasoning step-by-step

Return the optimized prompt in JSON format:
{{
    "optimized_prompt": "the improved prompt text here",
    "improvements_made": ["list of specific improvements"],
    "rationale": "explanation of why these changes will improve accuracy"
}}
"""

    messages = [
        {"role": "system", "content": "You are a prompt engineering expert. Return optimized prompts in JSON format."},
        {"role": "user", "content": optimization_prompt}
    ]

    try:
        response = call_minimax(messages, temperature=0.5)
        optimization_result = json.loads(response)
        optimized_prompt = optimization_result["optimized_prompt"]

        print(f"   ✅ Optimization complete")
        print(f"   📝 Improvements: {optimization_result['improvements_made']}")

        return optimized_prompt

    except Exception as e:
        print(f"   ❌ Optimization failed: {e}")
        return current_prompt  # Fallback to original

def test_prompt(prompt: str, variable: str, samples: List[TestSample]) -> Tuple[float, List[Dict]]:
    """Test a prompt on samples and return accuracy + detailed results."""
    correct = 0
    successful_tests = 0
    results = []

    print(f"   🧪 Testing prompt on {len(samples)} samples...")

    for i, sample in enumerate(samples):
        print(f"      {i+1}/{len(samples)}", end=" ", flush=True)

        result = call_qwen(prompt, sample.transcript)

        if result["success"]:
            predicted_value = result["value"]
            is_correct = predicted_value == sample.ground_truth_value
            successful_tests += 1

            if is_correct:
                correct += 1
                print("✅", end="")
            else:
                print("❌", end="")
        else:
            print("⚠️", end="")
            is_correct = False
            predicted_value = False

        results.append({
            "sample_index": sample.index,
            "transcript_preview": sample.transcript[:100] + "...",
            "predicted_value": predicted_value,
            "ground_truth_value": sample.ground_truth_value,
            "correct": is_correct,
            "predicted_reason": result["reason"],
            "ground_truth_reason": sample.ground_truth_reason,
            "api_success": result["success"],
            "raw_response": result["raw_response"][:200] + "..." if len(result["raw_response"]) > 200 else result["raw_response"]
        })

        time.sleep(0.5)  # Rate limiting

    print()  # New line after progress
    accuracy = correct / successful_tests if successful_tests > 0 else 0
    print(f"   📊 Accuracy: {accuracy:.1%} ({correct}/{successful_tests} successful tests)")
    if successful_tests < len(samples):
        print(f"   ⚠️  {len(samples) - successful_tests} samples failed API/parsing")

    return accuracy, results

def save_optimization_result(result: OptimizationResult):
    """Save optimization results for future reference."""
    import os
    os.makedirs(OPTIMIZED_PROMPTS_DIR, exist_ok=True)

    filename = f"{OPTIMIZED_PROMPTS_DIR}/{result.variable}_optimization.json"
    with open(filename, "w") as f:
        json.dump({
            "variable": result.variable,
            "original_accuracy": result.original_accuracy,
            "optimized_accuracy": result.optimized_accuracy,
            "improvement": result.optimized_accuracy - result.original_accuracy,
            "original_prompt": result.original_prompt,
            "optimized_prompt": result.optimized_prompt,
            "test_results": result.test_results,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }, f, indent=2)

    print(f"💾 Results saved to {filename}")

def optimize_variable(variable: str, num_samples: int = 20) -> OptimizationResult:
    """Complete optimization pipeline for a single variable."""
    print(f"\n🚀 Starting optimization for variable: {variable}")
    print("=" * 60)

    try:
        # 1. Load test samples
        samples = load_test_samples(variable, num_samples//2, num_samples//2)
        if len(samples) < 10:
            raise ValueError(f"Not enough samples found for {variable}. Need at least 10.")

        # 2. Get current prompt
        current_prompt = get_current_prompt(variable)
        print(f"📄 Current prompt loaded ({len(current_prompt)} chars)")

        # 3. Test current prompt
        print(f"📊 Testing current prompt...")
        original_accuracy, original_results = test_prompt(current_prompt, variable, samples)

        # 4. Optimize prompt
        optimized_prompt = optimize_prompt(variable, current_prompt, samples)

        # 5. Test optimized prompt
        print(f"📊 Testing optimized prompt...")
        optimized_accuracy, optimized_results = test_prompt(optimized_prompt, variable, samples)

        # 6. Compare results
        improvement = optimized_accuracy - original_accuracy
        print(f"\n📈 RESULTS:")
        print(f"   Original accuracy:  {original_accuracy:.1%}")
        print(f"   Optimized accuracy: {optimized_accuracy:.1%}")
        print(f"   Improvement:        {improvement:+.1%}")

        result = OptimizationResult(
            variable=variable,
            original_accuracy=original_accuracy,
            optimized_accuracy=optimized_accuracy,
            original_prompt=current_prompt,
            optimized_prompt=optimized_prompt,
            test_results=optimized_results
        )

        # 7. Save results
        save_optimization_result(result)

        return result

    except Exception as e:
        print(f"\n❌ Error in optimization pipeline: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise

def main():
    """Main pipeline runner."""
    import argparse

    parser = argparse.ArgumentParser(description="Optimize prompts for variable extraction")
    parser.add_argument("variable", help="Variable name to optimize")
    parser.add_argument("--samples", type=int, default=20, help="Number of test samples (default: 20)")
    parser.add_argument("--iterations", type=int, default=1, help="Number of optimization iterations (default: 1)")
    args = parser.parse_args()

    try:
        result = optimize_variable(args.variable, args.samples)

        if result.optimized_accuracy > result.original_accuracy:
            print(f"\n🎉 Optimization successful! Accuracy improved by {result.optimized_accuracy - result.original_accuracy:+.1%}")
            print(f"💡 Consider updating your prompt template with the optimized version.")
        else:
            print(f"\n⚠️  No improvement found. Current prompt may already be optimal.")

    except Exception as e:
        print(f"\n❌ Optimization failed: {e}")
        return 1

    return 0

if __name__ == "__main__":
    exit(main())