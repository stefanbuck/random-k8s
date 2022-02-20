#!/usr/bin/env zx

import { readFileSync, writeFileSync } from 'fs';
import { remark } from 'remark'
import strip from 'strip-markdown'

// git clone --depth 1 https://github.com/kubernetes/website.git ./tmp

function removeTemplateSnippet(str) {
    return str
        .replace(/\{\{\<\snote\s\>\}\}/g, '')
        .replace(/\{\{\<\s\/note\s\>\}\}/g, '')
        .replaceAll(/\{\{(.+?text="([^"]+)").+\}\}/g, '$2')
        .replaceAll(/\{\{(.+?term_id="([^"]+)").+\}\}/g, '$2')
        .replaceAll(/\{\{([^\}\}]+)\}\}/g, '');
}

async function markdownToText(md) {
    const rawMarkdown = removeTemplateSnippet(md);
    const output = await remark()
        .use(strip)
        .process(rawMarkdown)

    const text = output.toString()

    return text.trim().replaceAll(/\n/g, ' ').replace(/\s{2,}/g, ' ');
}

const ignoreCategories = ['community', 'user-type'];

async function getFileContent(filePath) {
    const fileContent = readFileSync(filePath, 'utf8')

    let [description] = fileContent.split('---').slice(-1)

    const [, title] = fileContent.match(/title: (.*)/) || []
    let [, tags] = fileContent.match(/tags:\n(.*)/m) || [, '']
    let [, id] = fileContent.match(/id: (.*)/m) || [, '']

    tags = tags.replace('-', ' ').trim();

    if (ignoreCategories.includes(tags)) {
        return '';
    }

    description = await markdownToText(description);

    const url = `https://kubernetes.io/docs/reference/glossary/?all=true#term-${id}`

    return { title, description, url };
}

let gloassaryFiles = (await globby(['./tmp/content/en/docs/reference/glossary/*.md']))
    .filter(f => !f.includes('index.md'));

const gloassary = [];

async function iterate(file) {
    if (!file) {
        console.log('Total gloassary:', gloassary.length);
        writeFileSync('./glossary.json', JSON.stringify(gloassary, null, 2));
        return;
    }

    const text = await getFileContent(file)
    if (text) {
        gloassary.push(text);
    }

    iterate(gloassaryFiles.shift())
}

iterate(gloassaryFiles.shift())
