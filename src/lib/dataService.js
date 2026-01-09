// Unified data service - works with or without backend
// Automatically detects backend availability and falls back to client-side storage

import localDB from './localDatabase';
import redditClient from './redditClient';
import clientScraper from './clientSubredditScraper';

const BACKEND_URL = process.env.VUE_APP_BACKEND_URL || 'http://localhost:3001';

class DataService {
  constructor() {
    this.backendAvailable = null;
    this.userId = null;
  }

  // Initialize the service
  async init() {
    await localDB.init();

    // Try to detect backend
    await this.checkBackend();

    // Load Reddit token if available
    redditClient.loadToken();

    return this;
  }

  // Check if backend is available
  async checkBackend() {
    try {
      const response = await fetch(`${BACKEND_URL}/health`, {
        method: 'GET',
        timeout: 3000
      });

      if (response.ok) {
        this.backendAvailable = true;
        console.log('✓ Backend detected at', BACKEND_URL);
        return true;
      }
    } catch (err) {
      // Backend not available
    }

    this.backendAvailable = false;
    console.log('⚠ Backend not available, using client-side storage');
    return false;
  }

  // Get user ID for backend requests
  getUserId() {
    if (!this.userId) {
      this.userId = localStorage.getItem('user_id');
      if (!this.userId) {
        this.userId = 'user-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('user_id', this.userId);
      }
    }
    return this.userId;
  }

  // Backend API helper
  async apiRequest(endpoint, options = {}) {
    if (!this.backendAvailable) {
      throw new Error('Backend not available');
    }

    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': this.getUserId(),
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    return response.json();
  }

  // ==================== Reddit Accounts ====================

  async connectRedditAccount() {
    if (this.backendAvailable) {
      // Use backend OAuth flow
      const { authUrl } = await this.apiRequest('/api/auth/reddit/connect?userId=' + this.getUserId());
      window.location.href = authUrl;
    } else {
      // Use client-side OAuth
      redditClient.startAuth();
    }
  }

  async handleRedditCallback() {
    if (this.backendAvailable) {
      // Backend handles it via redirect
      return;
    } else {
      // Client-side OAuth
      const result = redditClient.handleCallback();
      await redditClient.getMe(); // Save account info
      return result;
    }
  }

  async getRedditAccounts() {
    if (this.backendAvailable) {
      return this.apiRequest('/api/accounts');
    } else {
      return localDB.getRedditAccounts();
    }
  }

  async checkAccountHealth(accountId) {
    if (this.backendAvailable) {
      return this.apiRequest(`/api/accounts/${accountId}/check-health`, { method: 'POST' });
    } else {
      // Client-side shadowban check
      const account = await localDB.get('reddit_accounts', accountId);
      const result = await redditClient.checkShadowban(account.reddit_username);

      await localDB.updateRedditAccount(accountId, {
        is_shadowbanned: result.is_shadowbanned,
        shadowban_checked_at: result.checked_at
      });

      return result;
    }
  }

  // ==================== Subreddits ====================

  async getSubreddits(filters = {}) {
    if (this.backendAvailable) {
      const params = new URLSearchParams(filters);
      return this.apiRequest(`/api/subreddits?${params}`);
    } else {
      let subreddits = await localDB.getAllSubreddits();

      // Apply client-side filters
      if (filters.niche) {
        subreddits = subreddits.filter(s => s.niche_tags?.includes(filters.niche));
      }

      if (filters.minSubscribers) {
        subreddits = subreddits.filter(s => s.subscribers >= parseInt(filters.minSubscribers));
      }

      if (filters.maxKarma) {
        subreddits = subreddits.filter(s => !s.min_karma || s.min_karma <= parseInt(filters.maxKarma));
      }

      if (filters.search) {
        const query = filters.search.toLowerCase();
        subreddits = subreddits.filter(s => s.name.toLowerCase().includes(query));
      }

      // Sort by engagement
      subreddits.sort((a, b) => (b.engagement_score || 0) - (a.engagement_score || 0));

      return { subreddits, total: subreddits.length };
    }
  }

  async getSubreddit(nameOrId) {
    if (this.backendAvailable) {
      return this.apiRequest(`/api/subreddits/${nameOrId}`);
    } else {
      return localDB.getSubreddit(nameOrId);
    }
  }

  async scrapeSubreddit(name) {
    if (this.backendAvailable) {
      // TODO: Add backend scrape endpoint
      return this.apiRequest(`/api/subreddits/scrape/${name}`, { method: 'POST' });
    } else {
      return clientScraper.scrapeSubreddit(name);
    }
  }

  async scrapeSubreddits(names, onProgress) {
    if (this.backendAvailable) {
      // TODO: Add backend batch scrape
      return this.apiRequest('/api/subreddits/scrape-batch', {
        method: 'POST',
        body: JSON.stringify({ subreddits: names })
      });
    } else {
      return clientScraper.scrapeMultiple(names, onProgress);
    }
  }

  async findSimilarSubreddits(nameOrId) {
    if (this.backendAvailable) {
      return this.apiRequest(`/api/subreddits/${nameOrId}/similar`);
    } else {
      const sub = await localDB.getSubreddit(nameOrId);
      if (!sub) return [];

      const allSubs = await localDB.getAllSubreddits();

      // Find similar based on niche tags and cluster
      return allSubs
        .filter(s => s.name !== sub.name)
        .map(s => ({
          ...s,
          similarity: this.calculateSimilarity(sub, s)
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10);
    }
  }

  calculateSimilarity(sub1, sub2) {
    let score = 0;

    // Same cluster bonus
    if (sub1.cluster_id && sub1.cluster_id === sub2.cluster_id) {
      score += 30;
    }

    // Shared niche tags
    const tags1 = sub1.niche_tags || [];
    const tags2 = sub2.niche_tags || [];
    const sharedTags = tags1.filter(t => tags2.includes(t));
    score += sharedTags.length * 15;

    // Similar engagement
    const engagementDiff = Math.abs((sub1.engagement_score || 0) - (sub2.engagement_score || 0));
    score += Math.max(0, 20 - engagementDiff / 100);

    return score;
  }

  async trackSubreddit(subredditName, accountId, options = {}) {
    if (this.backendAvailable) {
      return this.apiRequest(`/api/subreddits/${subredditName}/track`, {
        method: 'POST',
        body: JSON.stringify({ reddit_account_id: accountId, ...options })
      });
    } else {
      return localDB.trackSubreddit(subredditName, accountId, options);
    }
  }

  async getTrackedSubreddits() {
    if (this.backendAvailable) {
      return this.apiRequest('/api/subreddits/tracked');
    } else {
      return localDB.getTrackedSubreddits();
    }
  }

  // ==================== Content ====================

  async getContent(filters = {}) {
    if (this.backendAvailable) {
      const params = new URLSearchParams(filters);
      return this.apiRequest(`/api/content?${params}`);
    } else {
      const items = await localDB.getContentItems(filters);
      return { content: items, total: items.length };
    }
  }

  async addContent(contentData) {
    if (this.backendAvailable) {
      return this.apiRequest('/api/content', {
        method: 'POST',
        body: JSON.stringify(contentData)
      });
    } else {
      return localDB.addContentItem(contentData);
    }
  }

  async updateContent(id, updates) {
    if (this.backendAvailable) {
      return this.apiRequest(`/api/content/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
    } else {
      return localDB.updateContentItem(id, updates);
    }
  }

  // ==================== Posting ====================

  async submitPost(postData) {
    const {
      subreddit,
      title,
      url,
      flair_id,
      auto_comment
    } = postData;

    // Always use Reddit client for posting (whether backend or client-side)
    const result = await redditClient.submitPost({
      subreddit,
      title,
      url,
      flair_id,
      nsfw: true
    });

    // Post auto-comment if specified
    if (auto_comment && result.name) {
      await redditClient.comment(result.name, auto_comment);
    }

    return result;
  }

  async getPostedContent(filters = {}) {
    if (this.backendAvailable) {
      const params = new URLSearchParams(filters);
      return this.apiRequest(`/api/posts?${params}`);
    } else {
      return localDB.getPostedContent(filters);
    }
  }

  // ==================== Settings ====================

  async saveSetting(key, value) {
    // Always store locally
    await localDB.saveSetting(key, value);

    // Also sync to backend if available
    if (this.backendAvailable) {
      try {
        await this.apiRequest('/api/settings', {
          method: 'POST',
          body: JSON.stringify({ key, value })
        });
      } catch (err) {
        console.warn('Failed to sync setting to backend:', err);
      }
    }

    return { key, value };
  }

  async getSetting(key, defaultValue = null) {
    // Try backend first
    if (this.backendAvailable) {
      try {
        const result = await this.apiRequest(`/api/settings/${key}`);
        return result.value;
      } catch (err) {
        // Fall through to local
      }
    }

    // Fall back to local
    return localDB.getSetting(key, defaultValue);
  }
}

// Export singleton
const dataService = new DataService();

export default dataService;
