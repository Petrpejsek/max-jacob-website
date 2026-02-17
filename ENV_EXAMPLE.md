# Environment Variables Example

Copy these to your `.env` file (local) or add to Render.com environment settings (production).

```env
# Admin Panel
ADMIN_PASSWORD=your_secure_password_here

# Session Security
SESSION_SECRET=your_random_session_secret_here

# Email Service (Resend.com)
RESEND_API_KEY=your_resend_api_key_here

# Preaudits - Search API (Serper.dev)
# Get your free API key at: https://serper.dev/
# Free tier: 2,500 searches/month
SERPER_API_KEY=your_serper_api_key_here

# Optional: Preaudit Settings
PREAUDIT_MAX_COUNT=50
PREAUDIT_DEFAULT_SEARCH_ENGINE=google
PREAUDIT_ENABLE_BING_FALLBACK=true

# Optional: Screenshot Settings
ENABLE_FULLPAGE_SCREENSHOTS=true

# Database & Storage (production only)
# PUBLIC_DIR=/path/to/persistent/storage
# DB_PATH=/path/to/persistent/data.db

# Production URL for deal threads (magic links and email notifications)
# Set to your live app URL, e.g. https://yourservice.onrender.com or https://maxandjacob.com
# BASE_URL=https://your-production-domain.com

# Node Environment
NODE_ENV=development
```

## Required for Preaudits

Only one new variable is required:

```env
SERPER_API_KEY=your_serper_api_key_here
```

Get your free API key at [Serper.dev](https://serper.dev/) - 2,500 searches/month free!
