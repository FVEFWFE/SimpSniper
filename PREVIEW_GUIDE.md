# How to Preview the Map UI

Follow these simple steps to see the NSFW Reddit map with the new Creator Platform features!

## 🚀 Quick Start (2 minutes)

### ✨ **NO REDDIT API KEY REQUIRED!**

This app uses Reddit's public JSON endpoints - **no authentication or API setup needed**. Just start and use!

### 1. **Start the Development Server**

```bash
npm run serve
```

Wait for it to compile (about 10-20 seconds).

You should see:
```
  App running at:
  - Local:   http://localhost:8080/
  - Network: http://192.168.x.x:8080/
```

### 2. **Open in Browser**

Go to **http://localhost:8080**

## 🗺️ Using the Map

### **Basic Navigation**

- **Pan**: Click and drag
- **Zoom**: Mouse wheel or pinch
- **Click a subreddit**: Shows preview and stats
- **Search**: Use the search box in top-left

### **Accessing Creator Tools**

1. Click the **hamburger menu** (three lines) in the top-left
2. Look for the **🛠️ Creator Tools (Beta)** section
3. Click **"Open Creator Dashboard"**

## 🎯 What You Can Do in Creator Dashboard

### **Everything Works Without Authentication!**

1. **Check Shadowban**
   - Enter any Reddit username (without u/)
   - Click "Check Shadowban" button
   - See if the account exists and is healthy
   - View karma and account stats

2. **Scrape Subreddit Data**
   - Enter a subreddit name (without "r/")
   - Example: `gonewild`, `feet`, `petite`
   - Click "Scrape"
   - See rules, requirements, engagement metrics
   - **No authentication needed!**

3. **Search Scraped Subreddits**
   - Use the search box to find subreddits
   - Filter by niche (Feet, Petite, etc.)
   - View detailed info for each

4. **Export Your Data**
   - Click "Export All Data (JSON)"
   - Downloads all your local data as backup

## 📊 What Gets Scraped

When you scrape a subreddit, you get:

✅ **Requirements**
- Minimum karma needed
- Account age requirement
- Verification required?

✅ **Rules**
- Link policies (in post vs profile only)
- Posting frequency limits
- Required flairs

✅ **Engagement Metrics**
- Average upvotes
- Average comments
- Engagement score

✅ **Best Posting Times**
- Top 3 hours per day of week
- Based on top posts analysis

✅ **Niche Tags**
- Auto-detected tags (feet, petite, cosplay, etc.)

## 🔍 Testing the Map

### **Test the NSFW Filter**

The map should only show NSFW subreddits. Try searching for:
- `gonewild` - should appear
- `gaming` - should NOT appear
- `feet` - should appear
- `programming` - should NOT appear

### **Test Subreddit Details**

1. Click any dot on the map
2. Should see subreddit preview panel
3. Click "Show related" to see similar subreddits

### **Test Creator Tools**

1. Open Creator Dashboard
2. Scrape a few subreddits: `gonewild`, `feet`, `petite`
3. Wait for each to finish (~1-2 seconds each)
4. View the scraped data in the list below
5. Search/filter the list

## 🐛 Troubleshooting

### **Map doesn't load**

- Check browser console (F12) for errors
- Make sure WebGL is enabled
- Try Chrome/Firefox (some browsers don't support WebGL)

### **Scraping fails**

- Reddit has rate limits (60 requests/minute)
- Wait a minute and try again
- Make sure the subreddit name is correct (no "r/" prefix)

### **Data disappeared**

- Data is stored in IndexedDB (browser storage)
- Clearing browser data will delete it
- Export regularly to JSON for backup

## 🎨 What's Different From Original Map

### **New Features:**

1. ✅ **NO AUTH REQUIRED** - Uses Reddit's public API, no login needed
2. ✅ **NSFW-only filter** - Only shows NSFW subreddits
3. ✅ **Creator Dashboard** - Integrated into sidebar
4. ✅ **Client-side mode** - Works without backend
5. ✅ **Subreddit scraper** - Get rules & requirements
6. ✅ **Local storage** - All data stays in your browser

### **Original Features Still Work:**

- Interactive map visualization
- Subreddit search
- Click to view subreddit
- Show related subreddits
- Street view mode (experimental)

## 📱 Mobile View

The map works on mobile/tablets but:
- Creator Dashboard is better on desktop
- Touch controls: pinch to zoom, drag to pan
- Tap a dot to view subreddit

## 🚀 Next Steps

Once you've tested the map:

1. **Deploy to production** - Works on any static host (Netlify, Vercel, GitHub Pages)
2. **Optional: Add backend** - For scheduling and multi-device sync
3. **Customize** - Add more filters, views, features

## 💡 Tips

- **Start small**: Scrape 5-10 subreddits first
- **Export data**: Regular backups prevent data loss
- **Use filters**: Search by niche to find relevant subreddits
- **Check requirements**: Know what karma/age you need before posting

## 📚 More Info

- See **CLIENT_SIDE_MODE.md** for technical details
- See **backend/README.md** for backend setup (optional)
- See your browser's DevTools Console for debug info

---

**Having issues?** Check the browser console (F12) for error messages!

**Want help?** Include the error message and what you were doing when it happened.

Enjoy exploring the NSFW Reddit Map! 🗺️✨
