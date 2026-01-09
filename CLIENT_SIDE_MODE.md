# Client-Side Mode

The Creator Platform now works **completely client-side** without requiring a backend server!

## 🎯 How It Works

The platform automatically detects if a backend is available and adapts:

### ✅ Client-Side Mode (No Backend)
- All data stored locally in **IndexedDB**
- Reddit OAuth using **implicit flow** (browser-only)
- Direct API calls to Reddit from browser
- Subreddit scraping in browser
- Imgur uploads directly from browser
- Data persists in your browser

### ⚡ Backend Mode (Optional)
- Multi-device sync
- Scheduled posting with cron jobs
- Advanced analytics
- Bulk operations
- Cloud storage integration

## 🚀 Quick Start (No Backend)

### 1. Configure Reddit OAuth

Get your Reddit app credentials:
1. Go to https://www.reddit.com/prefs/apps
2. Create an app (script type)
3. Set redirect URI to: `http://localhost:8080/auth/callback`

Add to `.env`:
```bash
VUE_APP_REDDIT_CLIENT_ID=your_client_id_here
VUE_APP_REDDIT_REDIRECT_URI=http://localhost:8080/auth/callback
```

### 2. Run the App

```bash
npm install
npm run serve
```

That's it! No database, no backend server required.

## 📦 What's Stored Locally

Everything is stored in **IndexedDB** in your browser:

- **Reddit Accounts**: Tokens, karma, account age
- **Subreddits**: Rules, requirements, engagement data
- **Content Items**: Your content vault with metadata
- **Posted Content**: Performance history
- **Settings**: User preferences

### Data Persistence

- Data persists across sessions
- Survives browser restarts
- Tied to your browser/device
- Can be exported/imported as JSON

## 🔄 Using the Data Service

The `dataService` automatically handles backend detection:

```javascript
import dataService from '@/lib/dataService';

// Initialize (detects backend automatically)
await dataService.init();

// All methods work the same whether backend exists or not
const accounts = await dataService.getRedditAccounts();
const subreddits = await dataService.getSubreddits({ niche: 'feet' });
await dataService.submitPost({ subreddit: 'gonewild', title: '...', url: '...' });
```

## 🎨 Client-Side Features

### ✅ Available Now

- ✅ Reddit OAuth (implicit flow)
- ✅ Connect multiple Reddit accounts
- ✅ Scrape subreddit rules & requirements
- ✅ Calculate engagement metrics
- ✅ Analyze best posting times
- ✅ Shadowban detection
- ✅ Submit posts directly to Reddit
- ✅ Track posted content history
- ✅ Content vault with local storage
- ✅ Subreddit filtering & search
- ✅ Find similar subreddits

### ⏳ Coming Soon

- ⏳ Imgur upload (client-side)
- ⏳ Caption generation (OpenAI API from browser)
- ⏳ Export/import data as JSON
- ⏳ PWA offline support

### ❌ Requires Backend

- ❌ Scheduled posting (needs cron)
- ❌ Multi-device sync
- ❌ Cloud storage integration (Google Drive/Dropbox)
- ❌ Background subreddit data refresh
- ❌ Automated shadowban checking

## 🔐 Security & Privacy

### Client-Side Mode

**Pros:**
- No central server storing your data
- You control everything locally
- No database to hack
- Reddit tokens only in your browser

**Cons:**
- Tokens stored in localStorage (use HTTPS!)
- No backup if you clear browser data
- Limited to one device/browser

### Best Practices

1. **Use HTTPS** in production (Netlify, Vercel auto-provide)
2. **Don't clear browser data** if you want to keep your settings
3. **Export your data** regularly (feature coming soon)
4. **Use browser sync** if you want multi-device (experimental)

## 🛠️ Advanced: Dual Mode

You can run **both** client-side and backend simultaneously:

```javascript
// Force client-side mode
localStorage.setItem('force_client_mode', 'true');

// Force backend mode
localStorage.setItem('force_backend_mode', 'true');

// Auto-detect (default)
localStorage.removeItem('force_client_mode');
localStorage.removeItem('force_backend_mode');
```

## 📊 Checking Current Mode

```javascript
await dataService.init();

if (dataService.backendAvailable) {
  console.log('Using backend at:', BACKEND_URL);
} else {
  console.log('Using client-side mode');
}
```

## 🚀 Deployment Options

### Option 1: Client-Side Only (Static Hosting)

Deploy to any static host:

```bash
npm run build
# Upload dist/ folder to:
# - Netlify
# - Vercel
# - GitHub Pages
# - S3 + CloudFront
```

**Cost:** FREE ✅

### Option 2: Client-Side + Optional Backend

Deploy frontend to static host, backend to:
- Railway (free tier)
- Render (free tier)
- Heroku

Users can choose to connect backend or use locally.

**Cost:** FREE with limits, ~$5-10/month for production

### Option 3: Full Backend (All Features)

Deploy both with:
- PostgreSQL database
- Redis for queues
- Background workers

**Cost:** ~$20-30/month

## 📝 Migration Path

Start client-side, upgrade later:

1. **Day 1**: Launch client-side only
2. **Week 1**: Users build content, track subreddits locally
3. **Month 1**: Launch backend for users who want scheduling
4. **Export/Import**: Users can migrate local data to backend

## 🎯 Recommended Approach

For most creators:

1. **Start client-side** - Get up and running in 5 minutes
2. **Use daily** - Post manually, track performance
3. **Upgrade later** - Add backend when you need scheduling

For agencies/power users:

1. **Deploy backend** - Get all features immediately
2. **Give clients choice** - They can use client-side or backend

## 🐛 Troubleshooting

### "Not authenticated" errors

- Make sure you've connected a Reddit account
- Check that OAuth tokens haven't expired (7 days for implicit flow)
- Try reconnecting: click "Connect Reddit Account"

### Data disappeared

- Check if browser data was cleared
- IndexedDB data is domain-specific (localhost vs production)
- Use browser dev tools > Application > IndexedDB to inspect

### Rate limiting

- Reddit has rate limits (60 requests/minute)
- Client-side mode respects these automatically
- Wait 1 minute if you see 429 errors

## 📚 API Reference

See `/src/lib/dataService.js` for complete API documentation.

All methods are async and return Promises:

```javascript
// Accounts
await dataService.connectRedditAccount()
await dataService.getRedditAccounts()
await dataService.checkAccountHealth(accountId)

// Subreddits
await dataService.getSubreddits({ niche: 'feet', maxKarma: 1000 })
await dataService.getSubreddit(name)
await dataService.scrapeSubreddit(name)
await dataService.trackSubreddit(name, accountId)

// Content
await dataService.getContent({ status: 'fresh' })
await dataService.addContent({ filename: '...', niche_tags: [...] })

// Posting
await dataService.submitPost({ subreddit, title, url })
await dataService.getPostedContent()

// Settings
await dataService.saveSetting('theme', 'dark')
await dataService.getSetting('theme', 'light')
```

## 🎉 Next Steps

Now that you have client-side mode working:

1. Build the UI to connect Reddit accounts
2. Add subreddit discovery interface
3. Create content vault UI
4. Implement posting workflow
5. Add performance analytics

The backend is optional - ship client-side first! 🚀
