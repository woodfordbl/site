import { getBlockText } from "@/lib/pages/block-text.ts";
import { countPageWords } from "@/lib/pages/page-word-count.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

/** One page's resolved content, fed into the content aggregations. */
export interface PageContentInput {
  blocks: Block[];
  icon?: string;
  pageId: string;
  title: string;
}

export interface PageContentStat {
  blocks: number;
  characters: number;
  icon?: string;
  pageId: string;
  title: string;
  words: number;
}

export interface BlockTypeCount {
  count: number;
  type: BlockType;
}

export interface ContentStats {
  /** Words / pages, rounded. */
  avgWordsPerPage: number;
  /** Block-type histogram, sorted by count descending. */
  blockTypeCounts: BlockTypeCount[];
  pageCount: number;
  /** Per-page rows, sorted by word count descending. */
  perPage: PageContentStat[];
  /** Total estimated reading time in minutes (200 wpm). */
  readingMinutes: number;
  totalBlocks: number;
  totalCharacters: number;
  totalWords: number;
}

function countCharacters(blocks: Block[]): number {
  let total = 0;
  for (const block of blocks) {
    total += getBlockText(block).length;
  }
  return total;
}

function countBlockTypes(blocks: Block[], into: Map<BlockType, number>): void {
  for (const block of blocks) {
    into.set(block.type, (into.get(block.type) ?? 0) + 1);
  }
}

export function computeContentStats(pages: PageContentInput[]): ContentStats {
  const perPage: PageContentStat[] = [];
  const blockTypeMap = new Map<BlockType, number>();

  let totalWords = 0;
  let totalBlocks = 0;
  let totalCharacters = 0;

  for (const page of pages) {
    const words = countPageWords(page.blocks);
    const characters = countCharacters(page.blocks);
    const blocks = page.blocks.length;

    totalWords += words;
    totalBlocks += blocks;
    totalCharacters += characters;
    countBlockTypes(page.blocks, blockTypeMap);

    perPage.push({
      pageId: page.pageId,
      title: page.title,
      icon: page.icon,
      words,
      blocks,
      characters,
    });
  }

  perPage.sort((left, right) => right.words - left.words);

  const blockTypeCounts = [...blockTypeMap.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count);

  const pageCount = pages.length;

  return {
    pageCount,
    totalWords,
    totalBlocks,
    totalCharacters,
    avgWordsPerPage: pageCount > 0 ? Math.round(totalWords / pageCount) : 0,
    readingMinutes: Math.max(0, Math.round(totalWords / 200)),
    perPage,
    blockTypeCounts,
  };
}

export interface WordFrequencyEntry {
  count: number;
  word: string;
}

export interface WordFrequencyResult {
  top: WordFrequencyEntry[];
  /** Total non-stopword term occurrences considered. */
  totalWords: number;
  /** Distinct non-stopword terms across all content. */
  uniqueWords: number;
}

/**
 * Common English function words plus markdown/editor noise, excluded from the
 * word-frequency ranking so the result surfaces meaningful terms.
 */
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "when",
  "at",
  "by",
  "for",
  "with",
  "about",
  "against",
  "between",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "to",
  "from",
  "up",
  "down",
  "in",
  "out",
  "on",
  "off",
  "over",
  "under",
  "again",
  "further",
  "of",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "am",
  "do",
  "does",
  "did",
  "doing",
  "have",
  "has",
  "had",
  "having",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "him",
  "his",
  "she",
  "her",
  "it",
  "its",
  "they",
  "them",
  "their",
  "this",
  "that",
  "these",
  "those",
  "what",
  "which",
  "who",
  "whom",
  "as",
  "so",
  "than",
  "too",
  "very",
  "can",
  "will",
  "just",
  "not",
  "no",
  "nor",
  "only",
  "own",
  "same",
  "such",
  "should",
  "now",
  "also",
  "any",
  "all",
  "more",
  "most",
  "other",
  "some",
  "there",
  "here",
  "how",
  "why",
  "where",
  "would",
  "could",
  "may",
  "might",
  "must",
  "shall",
  "us",
  "etc",
]);

const WORD_TOKEN = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu;
const DIGITS_ONLY = /^\d+$/;

export function computeWordFrequency(
  pages: PageContentInput[],
  limit = 40
): WordFrequencyResult {
  const counts = new Map<string, number>();
  let totalWords = 0;

  for (const page of pages) {
    for (const block of page.blocks) {
      const text = getBlockText(block);
      if (!text) {
        continue;
      }

      const matches = text.toLowerCase().matchAll(WORD_TOKEN);
      for (const match of matches) {
        const word = match[0];
        // Skip stopwords, single characters, and pure numbers.
        if (word.length < 2 || STOPWORDS.has(word) || DIGITS_ONLY.test(word)) {
          continue;
        }
        totalWords += 1;
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }
  }

  const top = [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.word.localeCompare(right.word)
    )
    .slice(0, limit);

  return { top, uniqueWords: counts.size, totalWords };
}

/** Friendly labels for block types in the composition chart. */
export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  heading: "Headings",
  toggleHeading: "Toggles",
  text: "Paragraphs",
  list: "Lists",
  quote: "Quotes",
  callout: "Callouts",
  code: "Code",
  checklist: "Checklists",
  checklistItem: "To-dos",
  pageLink: "Page links",
  divider: "Dividers",
  columns: "Column layouts",
  column: "Columns",
  tabs: "Tab groups",
  tab: "Tabs",
  media: "Media",
  embed: "Embeds",
  database: "Databases",
  table: "Tables",
  tableRow: "Table rows",
  tableCell: "Table cells",
};
