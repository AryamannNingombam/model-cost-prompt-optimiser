#!/usr/bin/env python3
from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="ningo-model-cost-optimizer",
    version="0.1.0",
    author="Ningo AI - Model Cost Optimizer Contributors",
    description="Reduce AI costs by 90%+ through intelligent model migration with optimized prompts",
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
    ],
    python_requires=">=3.8",
    install_requires=[
        "requests>=2.28.0",
        "pandas>=1.5.0",
        "numpy>=1.21.0",
        "click>=8.0.0",
    ],
    entry_points={
        "console_scripts": [
            "ningo-model-optimizer=model_optimizer.cli:main",
        ],
    },
)