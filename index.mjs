import { createRequire } from "module";
import got from 'got';
import twitter from 'twitter-text'
import Twit from 'twit'
import { readFileSync, writeFileSync } from 'fs';
import { truncate, getDescription, getTitle, wildcardEqual } from './uitls.mjs';

const require = createRequire(import.meta.url);
const glossary = require('./glossary.json');

const allow = [
  'https://kubernetes.io/docs/concepts/*',
  'https://kubernetes.io/docs/reference/*',
  'https://kubernetes.io/docs/tasks/*',
  'https://kubernetes.io/docs/concepts/containers/',
  'https://kubernetes.io/docs/concepts/extend-kubernetes/',
  'https://kubernetes.io/docs/concepts/scheduling-eviction/',
  'https://kubernetes.io/docs/concepts/services-networking/',
  'https://kubernetes.io/docs/concepts/workloads/',
  'https://kubernetes.io/docs/concepts/workloads/pods/',
  'https://kubernetes.io/docs/reference/setup-tools/kubeadm/',
]

const ignore = [
  'https://kubernetes.io/docs/reference/glossary/',
  'https://kubernetes.io/docs/tasks/tools/*',
]

function getTweetableUrls() {
  const sitemapContent = readFileSync(new URL('./sitemap.xml', import.meta.url));
  const links = [...sitemapContent.toString().matchAll(/<loc>(.*?)<\/loc>/g)].map(s => s[1]).sort();

  return links.filter((url, index, arr) => {

    // ignore overview pages that are just linking to their children
    // unless it has been explicitly allowed see `allow` array above
    if (arr[index + 1]?.includes(url)) {
      return allow.some(s => url === s);
    }

    // ensure that we don't include any links that are not explicitly allowed
    return allow.some(s =>
      wildcardEqual(s, url)) &&
      !ignore.some(s => wildcardEqual(s, url)
      );
  })
}

async function getPageDetails(url) {
  const html = await got.get(url).text();
  const doc = html.replace(/\n/g, ' ');

  const title = getTitle(doc);
  const description = getDescription(doc);
  return { title, description, url };
}

function prepareTweet({ title, description, url = '' }) {

  const hashtags = '#kubernetes'
  const newLines = '\n\n';

  const regex = /^This page \w+ how to/;
  description = description.replace(regex, 'Learn how to');

  if (title && description.toLowerCase().startsWith(title.toLowerCase())) {
    title = '';
  }

  if (description.includes('FEATURE STATE:')) {
    description = description.replace(/FEATURE STATE: Kubernetes v[0-9.]+ \[\w+\]/g, '');
  }

  description = description.replace(/\sSynopsis/g, '.');
  description = description.trim();

  let tweet = [title, description, url, hashtags].filter(Boolean).join(newLines)

  const { valid, validRangeEnd } = twitter.parseTweet(tweet);

  tweet = [title, description].filter(Boolean).join(newLines)

  let urlOffset = 0;
  if (url) {
    // A URL of any length will be altered to 23 characters,
    // even if the link itself is less than 23 characters long.
    const URL_LENGTH = 23;

    urlOffset = URL_LENGTH + newLines.length;
  }

  if (!valid) {
    tweet = truncate(tweet, validRangeEnd - urlOffset - hashtags.length - newLines.length);
  }

  tweet = `${tweet}${url ? newLines + url : ''}${newLines}#kubernetes`;

  if (!twitter.parseTweet(tweet).valid) {
    throw new Error('Tweet is too long');
  }

  return tweet;
}

function sendTweet(tweet) {
  var TwitterApi = new Twit({
    consumer_key: process.env['TWITTER_CONSUMER_KEY'],
    consumer_secret: process.env['TWITTER_CONSUMER_SECRET'],
    access_token: process.env['TWITTER_ACCESS_TOKEN'],
    access_token_secret: process.env['TWITTER_ACCESS_TOKEN_SECRET'],
    strictSSL: true,
  })

  TwitterApi.post('statuses/update', { status: tweet }, function (err, data, response) {
    if (err) {
      console.log('Error: ', err.toString());
      process.exit(1);
    }

    console.log('Tweet sent');
  })
}

function init() {
  const links = [...glossary, ...getTweetableUrls()];

  const RETRY_LIMIT = 10;
  let retryCount = 0;

  async function getRandomTweet() {
    if (retryCount > RETRY_LIMIT) {
      console.log('Unable to find URL to tweet');
      process.exit(1);
      return;
    }

    const link = links[Math.floor(Math.random() * links.length)];

    try {
      let tweetBody;

      if (typeof link === 'string') {
        // Random article tweet
        const { title, description, url } = await getPageDetails(link);
        tweetBody = prepareTweet({ title, description, url })

      } else {
        // Glossary tweet
        const { title, description, url } = link;
        tweetBody = prepareTweet({ title, description })

        if (tweetBody.includes('…')) {
          tweetBody = prepareTweet({ title, description, url })
        }
      }

      sendTweet(tweetBody);
    } catch (err) {
      retryCount++;
      console.log('Error: ', err.toString());
      console.log('URL:   ', link);
      console.log('Retry: ', retryCount);
      console.log('---------------');
      getRandomTweet();
    }
  }

  getRandomTweet();
}

init()