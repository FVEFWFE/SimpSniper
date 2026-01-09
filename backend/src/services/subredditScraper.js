const snoowrap = require('snoowrap');
const db = require('../config/database');

class SubredditScraper {
  constructor() {
    this.reddit = new snoowrap({
      userAgent: process.env.REDDIT_USER_AGENT,
      clientId: process.env.REDDIT_CLIENT_ID,
      clientSecret: process.env.REDDIT_CLIENT_SECRET,
      refreshToken: process.env.REDDIT_REFRESH_TOKEN // Use a service account
    });
  }

  async scrapeSubreddit(subredditName) {
    console.log(`Scraping r/${subredditName}...`);

    try {
      const sub = await this.reddit.getSubreddit(subredditName);
      await sub.fetch();

      // Basic info
      const data = {
        name: sub.display_name,
        display_name: sub.display_name_prefixed,
        subscribers: sub.subscribers,
        active_users: sub.accounts_active,
        created_utc: new Date(sub.created_utc * 1000),
        is_nsfw: sub.over18,
        description: sub.public_description
      };

      // Parse rules
      const rulesData = await this.parseRules(sub);
      Object.assign(data, rulesData);

      // Calculate engagement metrics
      const engagement = await this.calculateEngagement(sub);
      Object.assign(data, engagement);

      // Analyze best posting times
      data.best_posting_times = await this.analyzeBestPostingTimes(sub);

      // Infer niche tags
      data.niche_tags = this.inferNicheTags(sub);

      // Save to database
      await this.saveToDatabase(data);

      console.log(`✓ Scraped r/${subredditName}`);
      return data;
    } catch (error) {
      console.error(`✗ Failed to scrape r/${subredditName}:`, error.message);
      throw error;
    }
  }

  async parseRules(subreddit) {
    const requirements = {
      min_karma: null,
      min_post_karma: null,
      min_comment_karma: null,
      min_account_age_days: null,
      requires_verification: false,
      verification_instructions: null,
      allows_links_in_post: true,
      allows_links_in_comments: true,
      posting_frequency_limit: null,
      posting_frequency_hours: null,
      required_flairs: [],
      banned_words: [],
      content_types_allowed: ['image', 'video', 'gif', 'text']
    };

    let rulesText = '';

    // Get sidebar/description
    try {
      rulesText += subreddit.description || '';
    } catch (err) {
      // Ignore
    }

    // Get explicit rules
    try {
      const rules = await subreddit.getRules();
      for (const rule of rules) {
        rulesText += `\n${rule.short_name}: ${rule.description || rule.violation_reason}`;
      }
    } catch (err) {
      // Ignore
    }

    // Parse karma requirements
    const karmaPatterns = [
      /(\d+)\s*(?:combined\s*)?karma/i,
      /karma.*?(\d+)/i,
      /minimum.*?(\d+).*?karma/i
    ];

    for (const pattern of karmaPatterns) {
      const match = rulesText.match(pattern);
      if (match) {
        requirements.min_karma = parseInt(match[1]);
        break;
      }
    }

    // Parse account age
    const agePatterns = [
      /(\d+)\s*days?\s*old/i,
      /account.*?(\d+)\s*days/i,
      /(\d+)\s*day.*?account/i
    ];

    for (const pattern of agePatterns) {
      const match = rulesText.match(pattern);
      if (match) {
        requirements.min_account_age_days = parseInt(match[1]);
        break;
      }
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

    // Get flairs
    try {
      const flairs = await subreddit.getLinkFlairTemplates();
      requirements.required_flairs = flairs.map(f => f.text).filter(Boolean);
    } catch (err) {
      // Ignore
    }

    requirements.rules_raw = rulesText;
    requirements.rules_summary = this.generateRulesSummary(requirements);

    return requirements;
  }

  generateRulesSummary(requirements) {
    const parts = [];

    if (requirements.min_karma) {
      parts.push(`Need ${requirements.min_karma} karma`);
    }
    if (requirements.min_account_age_days) {
      parts.push(`Account must be ${requirements.min_account_age_days}+ days old`);
    }
    if (requirements.requires_verification) {
      parts.push('Verification required');
    }
    if (requirements.posting_frequency_limit) {
      parts.push(`Posting limit: ${requirements.posting_frequency_limit}`);
    }
    if (!requirements.allows_links_in_post) {
      parts.push('No links in posts (profile only)');
    }
    if (requirements.required_flairs.length > 0) {
      parts.push('Must use flair');
    }

    return parts.length > 0 ? parts.join('\n') : 'No special requirements found';
  }

  async calculateEngagement(subreddit, sampleSize = 100) {
    const upvotes = [];
    const comments = [];

    try {
      const posts = await subreddit.getHot({ limit: sampleSize });

      for (const post of posts) {
        upvotes.push(post.score);
        comments.push(post.num_comments);
      }
    } catch (err) {
      // Ignore
    }

    const avgUpvotes = upvotes.length > 0 ? upvotes.reduce((a, b) => a + b, 0) / upvotes.length : 0;
    const medianUpvotes = upvotes.length > 0 ? upvotes.sort((a, b) => a - b)[Math.floor(upvotes.length / 2)] : 0;
    const avgComments = comments.length > 0 ? comments.reduce((a, b) => a + b, 0) / comments.length : 0;

    // Simple engagement score
    const engagementScore = avgUpvotes * 0.7 + avgComments * 0.3;

    return {
      avg_upvotes: avgUpvotes,
      median_upvotes: medianUpvotes,
      avg_comments: avgComments,
      engagement_score: engagementScore
    };
  }

  async analyzeBestPostingTimes(subreddit, sampleSize = 200) {
    const performanceByTime = {};

    try {
      const posts = await subreddit.getTop({ time: 'month', limit: sampleSize });

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
    } catch (err) {
      // Ignore
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
  }

  inferNicheTags(subreddit) {
    const tags = [];
    const text = `${subreddit.display_name} ${subreddit.public_description || ''}`.toLowerCase();

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

  async saveToDatabase(data) {
    await db.query(`
      INSERT INTO subreddits (
        name, display_name, subscribers, active_users, created_utc, is_nsfw, description,
        avg_upvotes, median_upvotes, avg_comments, engagement_score,
        min_karma, min_post_karma, min_comment_karma, min_account_age_days,
        requires_verification, verification_instructions,
        rules_raw, rules_summary,
        allows_links_in_post, allows_links_in_comments, allows_links_in_profile_only,
        posting_frequency_limit, posting_frequency_hours,
        required_flairs, banned_words, content_types_allowed,
        best_posting_times, niche_tags,
        last_scraped
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, NOW()
      )
      ON CONFLICT (name) DO UPDATE SET
        display_name = $2, subscribers = $3, active_users = $4, is_nsfw = $6, description = $7,
        avg_upvotes = $8, median_upvotes = $9, avg_comments = $10, engagement_score = $11,
        min_karma = $12, min_account_age_days = $15, requires_verification = $16,
        rules_raw = $18, rules_summary = $19,
        allows_links_in_post = $20, allows_links_in_comments = $21,
        posting_frequency_limit = $23, posting_frequency_hours = $24,
        required_flairs = $25, best_posting_times = $28, niche_tags = $29,
        last_scraped = NOW(), updated_at = NOW()
    `, [
      data.name, data.display_name, data.subscribers, data.active_users, data.created_utc,
      data.is_nsfw, data.description,
      data.avg_upvotes, data.median_upvotes, data.avg_comments, data.engagement_score,
      data.min_karma, data.min_post_karma, data.min_comment_karma, data.min_account_age_days,
      data.requires_verification, data.verification_instructions,
      data.rules_raw, data.rules_summary,
      data.allows_links_in_post, data.allows_links_in_comments, data.allows_links_in_profile_only,
      data.posting_frequency_limit, data.posting_frequency_hours,
      data.required_flairs, data.banned_words, data.content_types_allowed,
      JSON.stringify(data.best_posting_times), data.niche_tags
    ]);
  }

  async scrapeMultiple(subredditNames, delayMs = 2000) {
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

      // Delay between requests to avoid rate limiting
      if (i < subredditNames.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    console.log(`\nBatch scrape complete:`);
    console.log(`✓ Success: ${results.success.length}`);
    console.log(`✗ Failed: ${results.failed.length}`);

    return results;
  }
}

module.exports = SubredditScraper;
