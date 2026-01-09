// Client-side subreddit scraper
// Fetches and parses subreddit data directly from Reddit's PUBLIC API
// NO AUTHENTICATION REQUIRED - uses public .json endpoints

import publicRedditClient from './publicRedditClient';
import localDB from './localDatabase';

class ClientSubredditScraper {

  async scrapeSubreddit(name) {
    console.log(`Scraping r/${name}...`);

    try {
      // Get basic subreddit info
      const sub = await publicRedditClient.getSubreddit(name);

      const data = {
        name: sub.name,
        display_name: sub.display_name,
        subscribers: sub.subscribers,
        active_users: sub.active_users,
        created_utc: new Date(sub.created * 1000).toISOString(),
        is_nsfw: sub.over18,
        description: sub.description
      };

      // Get and parse rules
      const rules = await publicRedditClient.getSubredditRules(name);
      const rulesData = this.parseRules(sub.description + '\n\n' + rules.map(r => `${r.short_name}: ${r.description}`).join('\n'));
      Object.assign(data, rulesData);

      // Calculate engagement from recent posts
      const engagement = await this.calculateEngagement(name);
      Object.assign(data, engagement);

      // Analyze best posting times
      data.best_posting_times = await this.analyzeBestPostingTimes(name);

      // Infer niche tags
      data.niche_tags = this.inferNicheTags(sub);

      // Save to local database
      await localDB.saveSubreddit(data);

      console.log(`✓ Scraped r/${name}`);
      return data;
    } catch (error) {
      console.error(`✗ Failed to scrape r/${name}:`, error.message);
      throw error;
    }
  }

  parseRules(rulesText) {
    const requirements = {
      min_karma: null,
      min_account_age_days: null,
      requires_verification: false,
      allows_links_in_post: true,
      allows_links_in_comments: true,
      posting_frequency_hours: null,
      posting_frequency_limit: null,
      rules_raw: rulesText,
      rules_summary: ''
    };

    // Parse karma requirements
    const karmaMatch = rulesText.match(/(\d+)\s*(?:combined\s*)?karma/i);
    if (karmaMatch) {
      requirements.min_karma = parseInt(karmaMatch[1]);
    }

    // Parse account age
    const ageMatch = rulesText.match(/(\d+)\s*days?\s*old/i);
    if (ageMatch) {
      requirements.min_account_age_days = parseInt(ageMatch[1]);
    }

    // Check verification
    if (/verif(y|ied|ication)/i.test(rulesText)) {
      requirements.requires_verification = true;
    }

    // Check link policies
    if (/no\s*(external\s*)?links?/i.test(rulesText)) {
      requirements.allows_links_in_post = false;
      requirements.allows_links_in_comments = false;
    }

    if (/links?\s*(only\s*)?(in\s*)?profile/i.test(rulesText)) {
      requirements.allows_links_in_post = false;
      requirements.allows_links_in_comments = false;
      requirements.allows_links_in_profile_only = true;
    }

    // Check posting frequency
    const freqMatch = rulesText.match(/(\d+)\s*(?:posts?|submissions?)\s*per\s*(\d+)?\s*(hour|day)/i);
    if (freqMatch) {
      const unit = freqMatch[3].toLowerCase();
      const hours = unit === 'day' ? 24 : parseInt(freqMatch[2] || 1);
      requirements.posting_frequency_hours = hours;
      requirements.posting_frequency_limit = `1 per ${hours} hours`;
    }

    // Generate summary
    const parts = [];
    if (requirements.min_karma) parts.push(`Need ${requirements.min_karma} karma`);
    if (requirements.min_account_age_days) parts.push(`Account must be ${requirements.min_account_age_days}+ days old`);
    if (requirements.requires_verification) parts.push('Verification required');
    if (requirements.posting_frequency_limit) parts.push(`Posting limit: ${requirements.posting_frequency_limit}`);
    if (!requirements.allows_links_in_post) parts.push('No links in posts (profile only)');

    requirements.rules_summary = parts.length > 0 ? parts.join('\n') : 'No special requirements found';

    return requirements;
  }

  async calculateEngagement(subreddit) {
    try {
      const posts = await publicRedditClient.getRecentPosts(subreddit, 50);

      const upvotes = posts.map(p => p.score);
      const comments = posts.map(p => p.num_comments);

      const avgUpvotes = upvotes.reduce((a, b) => a + b, 0) / upvotes.length;
      const sortedUpvotes = upvotes.sort((a, b) => a - b);
      const medianUpvotes = sortedUpvotes[Math.floor(sortedUpvotes.length / 2)];
      const avgComments = comments.reduce((a, b) => a + b, 0) / comments.length;

      const engagementScore = avgUpvotes * 0.7 + avgComments * 0.3;

      return {
        avg_upvotes: avgUpvotes,
        median_upvotes: medianUpvotes,
        avg_comments: avgComments,
        engagement_score: engagementScore
      };
    } catch (err) {
      return {
        avg_upvotes: 0,
        median_upvotes: 0,
        avg_comments: 0,
        engagement_score: 0
      };
    }
  }

  async analyzeBestPostingTimes(subreddit) {
    try {
      const posts = await publicRedditClient.getTopPosts(subreddit, 'month', 100);

      const performanceByTime = {};

      for (const post of posts) {
        const date = new Date(post.created_utc * 1000);
        const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
        const hour = date.getHours();
        const key = `${day}_${hour}`;

        if (!performanceByTime[key]) {
          performanceByTime[key] = [];
        }
        performanceByTime[key].push(post.score);
      }

      // Find best hours per day
      const bestTimes = {};
      for (const [key, scores] of Object.entries(performanceByTime)) {
        const [day, hour] = key.split('_');
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        if (!bestTimes[day]) {
          bestTimes[day] = [];
        }
        bestTimes[day].push({ hour: parseInt(hour), score: avgScore });
      }

      // Keep top 3 hours per day
      for (const day in bestTimes) {
        bestTimes[day] = bestTimes[day]
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map(h => h.hour);
      }

      return bestTimes;
    } catch (err) {
      return {};
    }
  }

  inferNicheTags(sub) {
    const tags = [];
    const text = `${sub.display_name} ${sub.public_description || ''}`.toLowerCase();

    const nicheKeywords = {
      'feet': ['feet', 'foot', 'toes', 'soles'],
      'petite': ['petite', 'tiny', 'small'],
      'bbw': ['bbw', 'curvy', 'thick', 'chubby'],
      'latina': ['latina', 'hispanic'],
      'asian': ['asian', 'japanese', 'korean'],
      'ebony': ['ebony', 'black'],
      'blonde': ['blonde', 'blond'],
      'redhead': ['redhead', 'ginger'],
      'brunette': ['brunette'],
      'milf': ['milf', 'mom', 'mature'],
      'cosplay': ['cosplay', 'costume'],
      'tattoo': ['tattoo', 'inked', 'alt'],
      'lingerie': ['lingerie', 'underwear'],
      'amateur': ['amateur', 'homemade', 'real'],
      'fitness': ['fitness', 'fit', 'athletic'],
      'goth': ['goth', 'emo'],
      'lesbian': ['lesbian']
    };

    for (const [tag, keywords] of Object.entries(nicheKeywords)) {
      if (keywords.some(kw => text.includes(kw))) {
        tags.push(tag);
      }
    }

    return tags.length > 0 ? tags : ['general'];
  }

  async scrapeMultiple(subredditNames, onProgress = null) {
    console.log(`Starting batch scrape of ${subredditNames.length} subreddits...`);

    const results = { success: [], failed: [] };

    for (let i = 0; i < subredditNames.length; i++) {
      const name = subredditNames[i];

      try {
        await this.scrapeSubreddit(name);
        results.success.push(name);
      } catch (error) {
        results.failed.push({ name, error: error.message });
      }

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: subredditNames.length,
          success: results.success.length,
          failed: results.failed.length
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\nBatch scrape complete:`);
    console.log(`✓ Success: ${results.success.length}`);
    console.log(`✗ Failed: ${results.failed.length}`);

    return results;
  }
}

export default new ClientSubredditScraper();
