// Client-side Reddit API service
// Uses implicit OAuth flow (no backend needed)

import localDB from './localDatabase';

const REDDIT_CLIENT_ID = process.env.VUE_APP_REDDIT_CLIENT_ID || 'YOUR_CLIENT_ID';
const REDDIT_REDIRECT_URI = process.env.VUE_APP_REDDIT_REDIRECT_URI || window.location.origin + '/auth/callback';
const REDDIT_USER_AGENT = 'web:creator-platform:v1.0.0';

class RedditClient {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.username = null;
  }

  // Start OAuth flow
  startAuth() {
    const state = Math.random().toString(36).substring(7);
    localStorage.setItem('reddit_auth_state', state);

    const authUrl = new URL('https://www.reddit.com/api/v1/authorize');
    authUrl.searchParams.set('client_id', REDDIT_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'token'); // Implicit flow
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('redirect_uri', REDDIT_REDIRECT_URI);
    authUrl.searchParams.set('duration', 'permanent');
    authUrl.searchParams.set('scope', 'identity edit read submit subscribe vote mysubreddits history');

    window.location.href = authUrl.toString();
  }

  // Handle OAuth callback (implicit flow)
  handleCallback() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      throw new Error(`OAuth error: ${error}`);
    }

    const savedState = localStorage.getItem('reddit_auth_state');
    if (state !== savedState) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    if (!accessToken) {
      throw new Error('No access token received');
    }

    // Store token
    this.accessToken = accessToken;
    this.tokenExpiry = Date.now() + (parseInt(expiresIn) * 1000);

    localStorage.setItem('reddit_access_token', accessToken);
    localStorage.setItem('reddit_token_expiry', this.tokenExpiry);
    localStorage.removeItem('reddit_auth_state');

    return { accessToken, expiresIn };
  }

  // Load token from storage
  loadToken() {
    const token = localStorage.getItem('reddit_access_token');
    const expiry = localStorage.getItem('reddit_token_expiry');

    if (token && expiry && Date.now() < parseInt(expiry)) {
      this.accessToken = token;
      this.tokenExpiry = parseInt(expiry);
      return true;
    }

    return false;
  }

  // Check if authenticated
  isAuthenticated() {
    return this.accessToken && Date.now() < this.tokenExpiry;
  }

  // Make API request to Reddit
  async api(endpoint, options = {}) {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const url = `https://oauth.reddit.com${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'User-Agent': REDDIT_USER_AGENT,
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Reddit API error: ${response.status}`);
    }

    return response.json();
  }

  // Get current user info
  async getMe() {
    const data = await this.api('/api/v1/me');
    this.username = data.name;

    // Save to local DB
    const existingAccounts = await localDB.getRedditAccounts();
    const existing = existingAccounts.find(a => a.reddit_id === data.id);

    const accountData = {
      reddit_username: data.name,
      reddit_id: data.id,
      post_karma: data.link_karma,
      comment_karma: data.comment_karma,
      account_age_days: Math.floor((Date.now() - data.created_utc * 1000) / (1000 * 60 * 60 * 24)),
      is_primary: existingAccounts.length === 0, // First account is primary
      access_token: this.accessToken,
      token_expiry: this.tokenExpiry
    };

    if (existing) {
      await localDB.updateRedditAccount(existing.id, accountData);
    } else {
      await localDB.addRedditAccount(accountData);
    }

    return data;
  }

  // Get subreddit info
  async getSubreddit(name) {
    const data = await this.api(`/r/${name}/about`);
    return data.data;
  }

  // Get subreddit rules
  async getSubredditRules(name) {
    const data = await this.api(`/r/${name}/about/rules`);
    return data.rules || [];
  }

  // Get hot posts from subreddit
  async getHotPosts(subreddit, limit = 100) {
    const data = await this.api(`/r/${subreddit}/hot?limit=${limit}`);
    return data.data.children.map(c => c.data);
  }

  // Get top posts from subreddit
  async getTopPosts(subreddit, time = 'month', limit = 100) {
    const data = await this.api(`/r/${subreddit}/top?t=${time}&limit=${limit}`);
    return data.data.children.map(c => c.data);
  }

  // Submit a post
  async submitPost(options) {
    const {
      subreddit,
      title,
      url,
      text,
      kind = 'link', // 'link', 'self', 'image', 'video'
      nsfw = true,
      spoiler = false,
      flair_id = null
    } = options;

    const formData = new URLSearchParams();
    formData.append('sr', subreddit);
    formData.append('kind', kind);
    formData.append('title', title);
    formData.append('nsfw', nsfw);
    formData.append('spoiler', spoiler);

    if (url) formData.append('url', url);
    if (text) formData.append('text', text);
    if (flair_id) formData.append('flair_id', flair_id);

    const data = await this.api('/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });

    // Save to posted content history
    const post = data.json.data;
    await localDB.addPostedContent({
      reddit_post_id: post.name,
      reddit_url: `https://reddit.com${post.url}`,
      permalink: post.permalink,
      subreddit_name: subreddit,
      title,
      upvotes: 0,
      score: 0
    });

    return post;
  }

  // Delete a post
  async deletePost(postId) {
    const formData = new URLSearchParams();
    formData.append('id', postId);

    return this.api('/api/del', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });
  }

  // Comment on a post
  async comment(postId, text) {
    const formData = new URLSearchParams();
    formData.append('thing_id', postId);
    formData.append('text', text);

    return this.api('/api/comment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });
  }

  // Check if profile is publicly visible (shadowban detection)
  async checkShadowban(username = null) {
    const user = username || this.username;

    try {
      const response = await fetch(`https://www.reddit.com/user/${user}/about.json`, {
        headers: { 'User-Agent': REDDIT_USER_AGENT }
      });

      const data = await response.json();

      // If profile doesn't exist or is suspended, likely shadowbanned
      const isShadowbanned = !data.data || data.data.is_suspended;

      return {
        username: user,
        is_shadowbanned: isShadowbanned,
        checked_at: new Date().toISOString()
      };
    } catch (err) {
      return {
        username: user,
        is_shadowbanned: true,
        checked_at: new Date().toISOString(),
        error: err.message
      };
    }
  }

  // Logout
  logout() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.username = null;

    localStorage.removeItem('reddit_access_token');
    localStorage.removeItem('reddit_token_expiry');
  }
}

// Export singleton
const redditClient = new RedditClient();

export default redditClient;
