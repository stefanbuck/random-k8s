import got from 'got';
import twitter from 'twitter-text'
import { readFileSync, writeFileSync } from 'fs';
import { truncate, getDescription, getTitle, wildcardEqual } from './uitls.mjs';

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

async function getMetaForPage(url) {
  const html = await got.get(url).text();
  const doc = html.replace(/\n/g, ' ');

  const title = getTitle(doc);
  const description = getDescription(doc);

  const hashtags = '#kubernetes'
  const newLines = '\n\n';

  let tweet = [title, url, description, hashtags].filter(Boolean).join(newLines)

  const { valid, validRangeEnd } = twitter.parseTweet(tweet);

  tweet = [title, url, description].filter(Boolean).join(newLines)


  if (!valid) {
    tweet = truncate(tweet, validRangeEnd - hashtags.length - newLines.length);
  }

  tweet = `${tweet}${newLines}#kubernetes`;

  if (!twitter.parseTweet(tweet).valid) {
    throw new Error('Tweet is too long');
  }

  console.log(tweet);
}

function init() {
  const links = getTweetableUrls();

  if (links.length === 0) {
    console.log('Sitemap is empty');
    process.exit(1);
  }

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
      await getMetaForPage(link);
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