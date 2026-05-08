# Model Cost Optimizer - Web Interface

A Next.js web application for testing and optimizing AI model prompts to reduce costs by migrating from expensive large models to cost-effective smaller models while maintaining performance.

## Features

- **Interactive Testing Environment**: Upload call transcripts and define variables to extract
- **Prompt Optimization**: AI-powered prompt improvement using Mixtral-8x7b
- **Model Analysis**: Run analysis using optimized Qwen-2.5-14B prompts
- **Performance Metrics**: Track latency, accuracy, and cost savings
- **Export Results**: Download analysis results as CSV

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd model-optimizer-interface
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.local.example .env.local
   ```
   
   Edit `.env.local` and add your Fireworks API key:
   ```
   FIREWORKS_API_KEY=your_fireworks_api_key_here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### 1. Input Data
- Paste your call transcript in the text area
- Define variables you want to extract:
  - **Variable Name**: Identifier for the variable (e.g., `customer_sentiment`)
  - **Type**: Boolean, String, or Number
  - **Description**: What the variable should capture

### 2. Optimize Prompts
- The system generates original prompts for each variable
- AI optimization improves prompts using Qwen-4B best practices
- Review optimization results and choose between original/optimized prompts

### 3. View Results
- Run analysis using selected prompts on Qwen-2.5-14B model
- See extracted values, reasoning, latency metrics, and raw outputs
- Export results to CSV for further analysis

## Deployment

### Deploy to Vercel

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```

3. **Set Environment Variables**
   In your Vercel dashboard, add the environment variable:
   - `FIREWORKS_API_KEY`: Your Fireworks AI API key

### Environment Variables

The application requires:
- `FIREWORKS_API_KEY`: API key from [Fireworks AI](https://fireworks.ai/)

## API Endpoints

### POST /api/optimize
Optimizes prompts for given variables and transcript.

**Request Body:**
```json
{
  "variables": [
    {
      "id": "1",
      "name": "customer_sentiment", 
      "type": "boolean",
      "description": "Whether customer expressed positive sentiment"
    }
  ],
  "transcript": "Call transcript text..."
}
```

### POST /api/analyze
Runs analysis using selected prompts.

**Request Body:**
```json
{
  "transcript": "Call transcript...",
  "variables": [...],
  "optimizationResults": [...],
  "promptChoices": {
    "customer_sentiment": "optimized"
  }
}
```

## Technology Stack

- **Framework**: Next.js 14 with App Router
- **UI**: Tailwind CSS + Heroicons
- **AI Models**: 
  - Mixtral-8x7b-Instruct (prompt optimization)
  - Qwen-2.5-14B-Instruct (analysis)
- **API**: Fireworks AI
- **Deployment**: Vercel

## Cost Optimization

This tool demonstrates how to achieve 90%+ cost reduction by:
1. Migrating from GPT-4/Claude (~$15-30/1M tokens) to Qwen-4B (~$0.2/1M tokens)
2. Optimizing prompts for better small model performance
3. Maintaining accuracy through intelligent prompt engineering

## License

MIT License - see LICENSE file for details