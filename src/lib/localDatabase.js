// Client-side database using IndexedDB
// Stores all user data locally in the browser

const DB_NAME = 'CreatorPlatformDB';
const DB_VERSION = 1;

class LocalDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Reddit Accounts
        if (!db.objectStoreNames.contains('reddit_accounts')) {
          const accountStore = db.createObjectStore('reddit_accounts', { keyPath: 'id', autoIncrement: true });
          accountStore.createIndex('reddit_username', 'reddit_username', { unique: false });
          accountStore.createIndex('is_primary', 'is_primary', { unique: false });
        }

        // Subreddits
        if (!db.objectStoreNames.contains('subreddits')) {
          const subStore = db.createObjectStore('subreddits', { keyPath: 'name' });
          subStore.createIndex('niche_tags', 'niche_tags', { unique: false, multiEntry: true });
          subStore.createIndex('engagement_score', 'engagement_score', { unique: false });
          subStore.createIndex('subscribers', 'subscribers', { unique: false });
        }

        // Tracked Subreddits
        if (!db.objectStoreNames.contains('tracked_subreddits')) {
          const trackedStore = db.createObjectStore('tracked_subreddits', { keyPath: 'id', autoIncrement: true });
          trackedStore.createIndex('subreddit_name', 'subreddit_name', { unique: false });
          trackedStore.createIndex('account_id', 'account_id', { unique: false });
        }

        // Content Items
        if (!db.objectStoreNames.contains('content_items')) {
          const contentStore = db.createObjectStore('content_items', { keyPath: 'id', autoIncrement: true });
          contentStore.createIndex('status', 'status', { unique: false });
          contentStore.createIndex('niche_tags', 'niche_tags', { unique: false, multiEntry: true });
          contentStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Posted Content History
        if (!db.objectStoreNames.contains('posted_content')) {
          const postedStore = db.createObjectStore('posted_content', { keyPath: 'id', autoIncrement: true });
          postedStore.createIndex('subreddit_name', 'subreddit_name', { unique: false });
          postedStore.createIndex('account_id', 'account_id', { unique: false });
          postedStore.createIndex('posted_at', 'posted_at', { unique: false });
        }

        // User Settings
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  // Generic CRUD operations
  async add(storeName, data) {
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.add(data);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName, data) {
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, key) {
    const tx = this.db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    const tx = this.db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, key) {
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName) {
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async query(storeName, indexName, value) {
    const tx = this.db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Convenience methods for specific stores

  // Reddit Accounts
  async addRedditAccount(account) {
    return this.add('reddit_accounts', {
      ...account,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  async getRedditAccounts() {
    return this.getAll('reddit_accounts');
  }

  async getPrimaryAccount() {
    const accounts = await this.query('reddit_accounts', 'is_primary', true);
    return accounts[0] || null;
  }

  async updateRedditAccount(id, updates) {
    const account = await this.get('reddit_accounts', id);
    if (!account) throw new Error('Account not found');

    return this.put('reddit_accounts', {
      ...account,
      ...updates,
      updated_at: new Date().toISOString()
    });
  }

  // Subreddits
  async saveSubreddit(subreddit) {
    return this.put('subreddits', {
      ...subreddit,
      last_scraped: new Date().toISOString()
    });
  }

  async getSubreddit(name) {
    return this.get('subreddits', name);
  }

  async getAllSubreddits() {
    return this.getAll('subreddits');
  }

  async getSubredditsByNiche(niche) {
    return this.query('subreddits', 'niche_tags', niche);
  }

  // Tracked Subreddits
  async trackSubreddit(subredditName, accountId, options = {}) {
    return this.add('tracked_subreddits', {
      subreddit_name: subredditName,
      account_id: accountId,
      is_verified: false,
      notes: options.notes || '',
      priority: options.priority || 0,
      created_at: new Date().toISOString()
    });
  }

  async getTrackedSubreddits(accountId = null) {
    if (accountId) {
      return this.query('tracked_subreddits', 'account_id', accountId);
    }
    return this.getAll('tracked_subreddits');
  }

  async untrackSubreddit(id) {
    return this.delete('tracked_subreddits', id);
  }

  // Content Items
  async addContentItem(content) {
    return this.add('content_items', {
      ...content,
      status: content.status || 'fresh',
      times_posted: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  async getContentItems(filters = {}) {
    let items = await this.getAll('content_items');

    if (filters.status) {
      items = items.filter(item => item.status === filters.status);
    }

    if (filters.niche) {
      items = items.filter(item => item.niche_tags?.includes(filters.niche));
    }

    return items;
  }

  async updateContentItem(id, updates) {
    const item = await this.get('content_items', id);
    if (!item) throw new Error('Content item not found');

    return this.put('content_items', {
      ...item,
      ...updates,
      updated_at: new Date().toISOString()
    });
  }

  // Posted Content
  async addPostedContent(post) {
    return this.add('posted_content', {
      ...post,
      posted_at: new Date().toISOString()
    });
  }

  async getPostedContent(filters = {}) {
    let posts = await this.getAll('posted_content');

    if (filters.subreddit_name) {
      posts = posts.filter(p => p.subreddit_name === filters.subreddit_name);
    }

    if (filters.account_id) {
      posts = posts.filter(p => p.account_id === filters.account_id);
    }

    return posts.sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at));
  }

  // Settings
  async saveSetting(key, value) {
    return this.put('settings', { key, value });
  }

  async getSetting(key, defaultValue = null) {
    const setting = await this.get('settings', key);
    return setting ? setting.value : defaultValue;
  }
}

// Export singleton instance
const localDB = new LocalDatabase();

export default localDB;
