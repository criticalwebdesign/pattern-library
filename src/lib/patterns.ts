import { getCollection, type CollectionEntry } from 'astro:content';

export type PatternImage = {
  id: string;
  src: CollectionEntry<'groups'>['data']['images'][number]['src'];
  alt: string;
  caption?: string;
  tags: string[];
  groupTitle: string;
  groupSlug: string;
};

export async function getAllImages(): Promise<PatternImage[]> {
  const groups = await getCollection('groups');
  return groups.flatMap((group) => {
    const groupTags = [group.data.category, group.data.platform].filter(
      (value): value is string => Boolean(value)
    );
    return group.data.images.map((image, index) => ({
      id: `${group.id}-${index}`,
      src: image.src,
      alt: image.alt,
      caption: image.caption,
      tags: [...new Set([...image.tags, ...groupTags])],
      groupTitle: group.data.title,
      groupSlug: group.id,
    }));
  });
}

export function getTagCounts(images: PatternImage[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const image of images) {
    for (const tag of image.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
