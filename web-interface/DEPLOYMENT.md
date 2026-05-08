# Deployment Guide

## Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.local.example .env.local
   ```
   
   Edit `.env.local` and add your Fireworks API key:
   ```
   FIREWORKS_API_KEY=your_fireworks_api_key_here
   ```

3. **Run development server**
   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## Deploy to Vercel

### Method 1: Vercel CLI (Recommended)

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel --prod
   ```

4. **Set Environment Variables**
   ```bash
   vercel env add FIREWORKS_API_KEY
   ```
   When prompted, enter your Fireworks API key.

### Method 2: Vercel Dashboard

1. **Import Project**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Import Project"
   - Connect your GitHub repository
   - Select this project directory

2. **Configure Environment Variables**
   - In project settings, add:
     - `FIREWORKS_API_KEY`: Your Fireworks AI API key

3. **Deploy**
   - Vercel will automatically deploy on push to main branch

### Method 3: GitHub Integration

1. **Connect GitHub Repository**
   - Push this code to a GitHub repository
   - In Vercel dashboard, import from GitHub

2. **Configure Auto-deploy**
   - Vercel will automatically deploy on every push to main
   - Add environment variables in Vercel dashboard

## Environment Variables

Required environment variables:

- `FIREWORKS_API_KEY`: Get from [Fireworks AI](https://fireworks.ai/)
  - Sign up for Fireworks AI account
  - Navigate to API Keys section
  - Create a new API key
  - Copy the key value

## API Rate Limits

The application includes built-in rate limiting (1 second delay between requests) to respect Fireworks API limits. For production use with high traffic:

1. Consider implementing Redis-based rate limiting
2. Add request queuing for batch operations
3. Monitor API usage and adjust delays accordingly

## Troubleshooting

### Build Issues
- Ensure all dependencies are installed: `npm install`
- Check TypeScript errors: `npm run build`
- Verify environment variables are set correctly

### API Issues
- Verify FIREWORKS_API_KEY is correctly set
- Check API quotas and rate limits
- Monitor network connectivity to api.fireworks.ai

### Performance
- API requests run sequentially to avoid rate limits
- Each variable optimization takes ~2-3 seconds
- Analysis time depends on transcript length and variable count

## Production Considerations

1. **Error Handling**: The app includes fallback error handling for API failures
2. **Timeouts**: API routes have 5-minute timeout limits
3. **Logging**: Check Vercel function logs for debugging
4. **Monitoring**: Consider adding analytics for usage tracking

## Security Notes

- API key is server-side only, never exposed to client
- All API requests are server-to-server
- Input validation on all API endpoints
- No data persistence - everything is processed in real-time