/**
 * Public Reddit API Client
 * Uses Reddit's public JSON endpoints - NO AUTHENTICATION REQUIRED
 *
 * Reddit exposes JSON data at public URLs by appending .json
 * Example: https://www.reddit.com/r/gonewild/about.json
 */

class PublicRedditClient {
  constructor() {
    this.baseUrl = 'https://www.reddit.com';
    this.requestDelay = 1000; // 1 second between requests to be polite
    this.lastRequestTime = 0;
  }

  /**
   * Rate limiting to avoid overwhelming Reddit's servers
   */
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.requestDelay) {
      await new Promise(resolve => setTimeout(resolve, this.requestDelay - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch JSON from Reddit with error handling
   */
  async fetchRedditJson(url) {
    await this.waitForRateLimit();

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MapOfReddit:v1.0.0 (by /u/creator)'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Subreddit not found');
      } else if (response.status === 403) {
        throw new Error('Subreddit is private or banned');
      } else if (response.status === 429) {
        throw new Error('Rate limited - please wait a minute');
      }
      throw new Error(`Reddit API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Get subreddit information
   */
  async getSubreddit(name) {
    const cleanName = name.replace(/^r\//, '');
    const url = `${this.baseUrl}/r/${cleanName}/about.json`;

    try {
      const data = await this.fetchRedditJson(url);
      const sub = data.data;

      return {
        name: sub.display_name,
        display_name: sub.display_name_prefixed,
        title: sub.title,
        description: sub.public_description,
        subscribers: sub.subscribers,
        active_users: sub.active_user_count,
        created: sub.created_utc,
        over18: sub.over18,
        url: `https://www.reddit.com${sub.url}`,
        icon: sub.icon_img || sub.community_icon,
        banner: sub.banner_img || sub.banner_background_image
      };
    } catch (error) {
      console.error(`Error fetching subreddit ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get subreddit rules
   */
  async getSubredditRules(name) {
    const cleanName = name.replace(/^r\//, '');
    const url = `${this.baseUrl}/r/${cleanName}/about/rules.json`;

    try {
      const data = await this.fetchRedditJson(url);

      if (data.rules) {
        return data.rules.map(rule => ({
          short_name: rule.short_name,
          description: rule.description,
          kind: rule.kind,
          violation_reason: rule.violation_reason
        }));
      }

      return [];
    } catch (error) {
      console.error(`Error fetching rules for ${name}:`, error);
      return [];
    }
  }

  /**
   * Get top posts from a subreddit
   */
  async getTopPosts(name, timeframe = 'month', limit = 25) {
    const cleanName = name.replace(/^r\//, '');
    const url = `${this.baseUrl}/r/${cleanName}/top.json?t=${timeframe}&limit=${limit}`;

    try {
      const data = await this.fetchRedditJson(url);

      if (data.data && data.data.children) {
        return data.data.children.map(child => {
          const post = child.data;
          return {
            id: post.id,
            title: post.title,
            author: post.author,
            score: post.score,
            upvote_ratio: post.upvote_ratio,
            num_comments: post.num_comments,
            created_utc: post.created_utc,
            url: post.url,
            permalink: `https://www.reddit.com${post.permalink}`,
            is_video: post.is_video,
            link_flair_text: post.link_flair_text
          };
        });
      }

      return [];
    } catch (error) {
      console.error(`Error fetching top posts for ${name}:`, error);
      return [];
    }
  }

  /**
   * Get recent posts from a subreddit
   */
  async getRecentPosts(name, limit = 25) {
    const cleanName = name.replace(/^r\//, '');
    const url = `${this.baseUrl}/r/${cleanName}.json?limit=${limit}`;

    try {
      const data = await this.fetchRedditJson(url);

      if (data.data && data.data.children) {
        return data.data.children.map(child => {
          const post = child.data;
          return {
            id: post.id,
            title: post.title,
            author: post.author,
            score: post.score,
            upvote_ratio: post.upvote_ratio,
            num_comments: post.num_comments,
            created_utc: post.created_utc,
            url: post.url,
            permalink: `https://www.reddit.com${post.permalink}`,
            is_video: post.is_video,
            link_flair_text: post.link_flair_text
          };
        });
      }

      return [];
    } catch (error) {
      console.error(`Error fetching recent posts for ${name}:`, error);
      return [];
    }
  }

  /**
   * Check if user is shadowbanned (requires username)
   * Uses public about.json endpoint
   */
  async checkShadowban(username) {
    const cleanUsername = username.replace(/^u\//, '');
    const url = `${this.baseUrl}/user/${cleanUsername}/about.json`;

    try {
      const data = await this.fetchRedditJson(url);

      if (data.data) {
        return {
          exists: true,
          shadowbanned: false,
          username: data.data.name,
          link_karma: data.data.link_karma,
          comment_karma: data.data.comment_karma,
          created_utc: data.data.created_utc
        };
      }

      return {
        exists: false,
        shadowbanned: true
      };
    } catch (error) {
      if (error.message.includes('404')) {
        return {
          exists: false,
          shadowbanned: true
        };
      }
      throw error;
    }
  }

  /**
   * Search for subreddits (public search)
   */
  async searchSubreddits(query, limit = 10) {
    const url = `${this.baseUrl}/subreddits/search.json?q=${encodeURIComponent(query)}&limit=${limit}`;

    try {
      const data = await this.fetchRedditJson(url);

      if (data.data && data.data.children) {
        return data.data.children.map(child => {
          const sub = child.data;
          return {
            name: sub.display_name,
            display_name: sub.display_name_prefixed,
            title: sub.title,
            subscribers: sub.subscribers,
            over18: sub.over18,
            url: `https://www.reddit.com${sub.url}`
          };
        });
      }

      return [];
    } catch (error) {
      console.error('Error searching subreddits:', error);
      return [];
    }
  }
}

// Export singleton instance
const publicRedditClient = new PublicRedditClient();
export default publicRedditClient;
