<template>
  <div class="client-side-example">
    <h2>Client-Side Mode Example</h2>

    <!-- Backend Status -->
    <div class="status-card">
      <h3>Mode Status</h3>
      <div v-if="backendStatus === null">Checking...</div>
      <div v-else-if="backendStatus">
        ✅ Backend Available
        <small>(Using server at {{ backendUrl }})</small>
      </div>
      <div v-else>
        ⚠️ Client-Side Mode
        <small>(All data stored locally in browser)</small>
      </div>
    </div>

    <!-- Reddit Account -->
    <div class="account-card">
      <h3>Reddit Account</h3>

      <div v-if="!authenticated">
        <button @click="connectReddit">Connect Reddit Account</button>
        <p class="hint">Uses Reddit OAuth (no backend required)</p>
      </div>

      <div v-else-if="account">
        <div class="account-info">
          <strong>u/{{ account.reddit_username }}</strong>
          <div>
            Post Karma: {{ account.post_karma }}
            | Comment Karma: {{ account.comment_karma }}
          </div>
          <div>Account Age: {{ account.account_age_days }} days</div>

          <button @click="checkShadowban" :disabled="checking">
            {{ checking ? 'Checking...' : 'Check Shadowban' }}
          </button>

          <div v-if="shadowbanResult">
            <span v-if="shadowbanResult.is_shadowbanned" style="color: red">
              ⚠️ Account may be shadowbanned
            </span>
            <span v-else style="color: green">
              ✅ Account looks healthy
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Subreddit Scraping -->
    <div class="scrape-card">
      <h3>Scrape Subreddit</h3>

      <input
        v-model="subredditToScrape"
        placeholder="Enter subreddit name (without r/)"
        @keyup.enter="scrapeSubreddit"
      />
      <button @click="scrapeSubreddit" :disabled="scraping">
        {{ scraping ? 'Scraping...' : 'Scrape' }}
      </button>

      <div v-if="scrapedData" class="scraped-data">
        <h4>r/{{ scrapedData.name }}</h4>
        <p>{{ scrapedData.subscribers?.toLocaleString() }} subscribers</p>
        <p>Engagement Score: {{ scrapedData.engagement_score?.toFixed(0) }}</p>

        <div v-if="scrapedData.rules_summary">
          <strong>Rules:</strong>
          <pre>{{ scrapedData.rules_summary }}</pre>
        </div>

        <div v-if="scrapedData.niche_tags">
          <strong>Niche Tags:</strong>
          {{ scrapedData.niche_tags.join(', ') }}
        </div>
      </div>
    </div>

    <!-- Subreddit List -->
    <div class="subreddits-card">
      <h3>Scraped Subreddits</h3>

      <input
        v-model="searchQuery"
        placeholder="Search subreddits..."
        @input="loadSubreddits"
      />

      <div class="filters">
        <select v-model="nicheFilter" @change="loadSubreddits">
          <option value="">All Niches</option>
          <option value="feet">Feet</option>
          <option value="petite">Petite</option>
          <option value="cosplay">Cosplay</option>
          <option value="latina">Latina</option>
        </select>
      </div>

      <div v-if="subreddits.length === 0" class="empty">
        No subreddits scraped yet. Try scraping some above!
      </div>

      <div v-else class="subreddit-list">
        <div v-for="sub in subreddits" :key="sub.name" class="subreddit-item">
          <strong>r/{{ sub.name }}</strong>
          <div class="sub-meta">
            {{ sub.subscribers?.toLocaleString() }} subs
            | Engagement: {{ sub.engagement_score?.toFixed(0) }}
            <span v-if="sub.niche_tags">
              | {{ sub.niche_tags.join(', ') }}
            </span>
          </div>

          <button @click="viewSubreddit(sub)">View Details</button>
        </div>
      </div>
    </div>

    <!-- Data Export -->
    <div class="export-card">
      <h3>Data Management</h3>

      <button @click="exportData">Export All Data (JSON)</button>
      <button @click="clearData" style="background: red; color: white">
        Clear All Local Data
      </button>

      <p class="hint">
        Data is stored in your browser's IndexedDB.
        Export regularly to avoid data loss.
      </p>
    </div>
  </div>
</template>

<script>
import dataService from '@/lib/dataService';

export default {
  name: 'ExampleClientSide',

  data() {
    return {
      backendStatus: null,
      backendUrl: process.env.VUE_APP_BACKEND_URL || 'http://localhost:3001',
      authenticated: false,
      account: null,
      checking: false,
      shadowbanResult: null,
      subredditToScrape: '',
      scraping: false,
      scrapedData: null,
      subreddits: [],
      searchQuery: '',
      nicheFilter: ''
    };
  },

  async mounted() {
    await dataService.init();
    this.backendStatus = dataService.backendAvailable;

    // Check if already authenticated
    this.authenticated = dataService.redditClient?.isAuthenticated() || false;

    if (this.authenticated) {
      await this.loadAccount();
    }

    await this.loadSubreddits();
  },

  methods: {
    async connectReddit() {
      await dataService.connectRedditAccount();
    },

    async loadAccount() {
      const accounts = await dataService.getRedditAccounts();
      this.account = accounts[0] || null;
    },

    async checkShadowban() {
      if (!this.account) return;

      this.checking = true;
      try {
        this.shadowbanResult = await dataService.checkAccountHealth(this.account.id);
      } catch (err) {
        alert('Error checking shadowban: ' + err.message);
      } finally {
        this.checking = false;
      }
    },

    async scrapeSubreddit() {
      if (!this.subredditToScrape || !this.authenticated) {
        alert('Please connect Reddit account first');
        return;
      }

      this.scraping = true;
      try {
        this.scrapedData = await dataService.scrapeSubreddit(this.subredditToScrape);
        await this.loadSubreddits();
      } catch (err) {
        alert('Error scraping: ' + err.message);
      } finally {
        this.scraping = false;
      }
    },

    async loadSubreddits() {
      const result = await dataService.getSubreddits({
        search: this.searchQuery,
        niche: this.nicheFilter
      });

      this.subreddits = result.subreddits || result;
    },

    viewSubreddit(sub) {
      alert(`Details for r/${sub.name}:\n\n${JSON.stringify(sub, null, 2)}`);
    },

    async exportData() {
      const data = {
        accounts: await dataService.getRedditAccounts(),
        subreddits: await dataService.getSubreddits({}),
        content: await dataService.getContent({}),
        posted: await dataService.getPostedContent({})
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `creator-platform-backup-${new Date().toISOString()}.json`;
      a.click();
    },

    async clearData() {
      if (!confirm('This will delete ALL local data. Are you sure?')) {
        return;
      }

      // Clear IndexedDB
      await dataService.localDB.clear('reddit_accounts');
      await dataService.localDB.clear('subreddits');
      await dataService.localDB.clear('content_items');
      await dataService.localDB.clear('posted_content');

      // Clear localStorage
      localStorage.clear();

      alert('All data cleared. Reload the page.');
      window.location.reload();
    }
  }
};
</script>

<style scoped>
.client-side-example {
  max-width: 800px;
  margin: 20px auto;
  padding: 20px;
}

.status-card,
.account-card,
.scrape-card,
.subreddits-card,
.export-card {
  background: #f5f5f5;
  padding: 20px;
  margin-bottom: 20px;
  border-radius: 8px;
}

h3 {
  margin-top: 0;
}

button {
  background: #4CAF50;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 10px;
}

button:hover {
  background: #45a049;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

input,
select {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-right: 10px;
  width: 300px;
}

.hint {
  font-size: 12px;
  color: #666;
  margin-top: 10px;
}

.account-info {
  margin-top: 10px;
}

.scraped-data {
  margin-top: 20px;
  padding: 15px;
  background: white;
  border-radius: 4px;
}

.scraped-data pre {
  background: #f0f0f0;
  padding: 10px;
  border-radius: 4px;
  white-space: pre-wrap;
}

.subreddit-list {
  margin-top: 20px;
}

.subreddit-item {
  background: white;
  padding: 15px;
  margin-bottom: 10px;
  border-radius: 4px;
}

.sub-meta {
  font-size: 14px;
  color: #666;
  margin: 5px 0;
}

.empty {
  padding: 20px;
  text-align: center;
  color: #999;
}
</style>
