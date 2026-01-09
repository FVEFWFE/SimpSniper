# Creator Platform Backend

Backend API server for the Reddit Creator Intelligence Platform.

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Set Up PostgreSQL Database

Create a PostgreSQL database:

```bash
createdb creator_platform
```

### 3. Configure Environment Variables

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your:
- PostgreSQL connection details
- Reddit API credentials (business account)
- Imgur API credentials (business account)
- Redis URL
- JWT secret

### 4. Run Migrations

```bash
npm run migrate
```

This will create all necessary database tables.

### 5. Scrape Subreddit Data

Populate the database with NSFW subreddit information:

```bash
npm run scrape
```

This will:
- Fetch the list of subreddits from the map data
- Filter to only NSFW subreddits
- Scrape rules, engagement metrics, and requirements from Reddit
- Store everything in the database

⚠️ **Note**: The scraper has a 3-second delay between requests to respect Reddit's rate limits. Scraping all subreddits will take several hours.

### 6. Start the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:3001`

## API Endpoints

### Authentication
- `GET /api/auth/reddit/connect` - Start Reddit OAuth flow
- `GET /api/auth/reddit/callback` - OAuth callback
- `POST /api/auth/create-test-user` - Create test user (dev only)

### Accounts
- `GET /api/accounts` - List all Reddit accounts
- `GET /api/accounts/:id` - Get account details
- `DELETE /api/accounts/:id` - Remove account
- `POST /api/accounts/:id/check-health` - Check shadowban status and update karma

### Subreddits
- `GET /api/subreddits` - List subreddits (with filters)
- `GET /api/subreddits/:id` - Get subreddit details
- `GET /api/subreddits/:id/similar` - Find similar subreddits
- `POST /api/subreddits/:id/track` - Add to tracked list
- `DELETE /api/subreddits/:id/track` - Remove from tracked list

### Content
- `GET /api/content` - List content items
- `GET /api/content/:id` - Get content details
- `PATCH /api/content/:id` - Update metadata
- `GET /api/content/:id/history` - Get posting history
- `DELETE /api/content/:id` - Delete content

### Schedule
- `GET /api/schedule` - Get scheduled posts
- `POST /api/schedule` - Create scheduled post
- `PATCH /api/schedule/:id` - Update scheduled post
- `DELETE /api/schedule/:id` - Cancel scheduled post

## Authentication

Currently using simple header-based auth for development:

```
X-User-Id: <user-uuid>
```

TODO: Implement proper JWT authentication.

## Database Schema

See `/database/migrations/001_initial_schema.sql` for the complete schema.

Key tables:
- `users` - User accounts
- `reddit_accounts` - Connected Reddit accounts
- `subreddits` - Master subreddit database
- `content_items` - User's content vault
- `scheduled_posts` - Post scheduling queue
- `posted_content` - Historical post performance

## Development

### Adding a New Migration

1. Create a new file in `/database/migrations/` with format: `002_description.sql`
2. Run `npm run migrate`

### Testing the API

Use the health check endpoint:

```bash
curl http://localhost:3001/health
```

Create a test user:

```bash
curl -X POST http://localhost:3001/api/auth/create-test-user
```

## Next Steps

- [ ] Implement proper JWT authentication
- [ ] Add Bull queue for scheduled posting
- [ ] Implement Imgur upload service
- [ ] Add OpenAI caption generation
- [ ] Set up cron jobs for:
  - Subreddit data refresh
  - Shadowban checking
  - Post performance tracking
