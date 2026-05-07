"""
Model Cost Optimizer - Reduce AI costs by migrating to smaller models with optimized prompts.

This package provides tools for systematically migrating from expensive large models
to cost-effective smaller models while maintaining or improving performance.
"""

from .core.migrator import ModelMigrator
from .core.cost_calculator import CostCalculator
from .core.validator import PerformanceValidator
from .utils.data_loader import DataLoader
from .utils.metrics import calculate_metrics

__version__ = "0.1.0"
__author__ = "Model Cost Optimizer Contributors"

__all__ = [
    "ModelMigrator",
    "CostCalculator",
    "PerformanceValidator",
    "DataLoader",
    "calculate_metrics",
]