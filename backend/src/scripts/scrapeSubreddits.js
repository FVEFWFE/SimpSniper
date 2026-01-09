require('dotenv').config();
const SubredditScraper = require('../services/subredditScraper');
const { isNSFW } = require('../../../src/lib/nsfwFilter');
const fetch = require('node-fetch');

async function scrapeFromNodeIds() {
  console.log('Fetching NSFW subreddit list from map data...\n');

  try {
    // Fetch the node-ids.txt file
    const response = await fetch('https://anvaka.github.io/map-of-reddit-data/v3/node-ids.txt');
    const text = await response.text();
    const allSubreddits = text.split('\n').filter(Boolean);

    // Filter to only NSFW
    const nsfwSubreddits = allSubreddits.filter(isNSFW);

    console.log(`Found ${nsfwSubreddits.length} NSFW subreddits out of ${allSubreddits.length} total\n`);

    // Limit for testing - remove this in production
    const subredditsToScrape = nsfwSubreddits.slice(0, 50);
    console.log(`Scraping first ${subredditsToScrape.length} for testing...\n`);

    const scraper = new SubredditScraper();
    const results = await scraper.scrapeMultiple(subredditsToScrape, 3000); // 3s delay between requests

    console.log('\n═══════════════════════════════════════');
    console.log('SCRAPING COMPLETE');
    console.log('═══════════════════════════════════════');
    console.log(`Total: ${subredditsToScrape.length}`);
    console.log(`Success: ${results.success.length}`);
    console.log(`Failed: ${results.failed.length}`);

    if (results.failed.length > 0) {
      console.log('\nFailed subreddits:');
      results.failed.forEach(f => console.log(`  - r/${f.name}: ${f.error}`));
    }

    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  scrapeFromNodeIds();
}

module.exports = { scrapeFromNodeIds };
