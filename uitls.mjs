export function getTitle(doc) {
  const MAX_TITLE_LENGTH = 50;

  let [, title] = /<h1>(.*?)<\/h1>/ig.exec(doc) || [, ''];

  if (title.length > MAX_TITLE_LENGTH) {
    title = title.slice(0, MAX_TITLE_LENGTH) + '…';
  }

  return title;
}

export function getDescription(doc) {
  let [, description] = /<meta name="?description"? content="([^"]+)">/ig.exec(doc) || [, ''];
  return description.replace(/\n/g, ' ').replace(/  +/g, ' ');
}

export function truncate(str, offsetEnd) {
  return str.slice(0, offsetEnd).split(' ').slice(0, -1).join(' ') + '…';
}

export function wildcardEqual(a, b) {
  if (a.endsWith('*')) {
    return b.startsWith(a.slice(0, -1));
  }

  return b === a;
}