import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Platform, Text, View, type TextStyle } from "react-native";
import { readDocRpc } from "../shared/issues.js";
import { errorText } from "../shared/errors.js";

type Theme = PluginSurfaceProps["theme"];

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
const HEADING_SIZES = [22, 18, 16, 14, 14, 14];

/** `.zekoder/bugs/001-foo.md` → `001-foo`. */
export function docName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}

interface DocViewerProps {
  theme: Theme;
  root: string;
  path: string;
}

/** Read-only view of one `.zekoder/` markdown doc. Frontmatter is hidden: the detail panel shows it. */
export function DocViewer({ theme, root, path }: DocViewerProps) {
  const readDoc = useRpc(readDocRpc);
  const doc = useQuery({
    queryKey: ["zekoder", "doc", root, path],
    queryFn: () => readDoc({ root, path }),
  });
  const blocks = useMemo(
    () => parseMarkdown(stripFrontmatter(doc.data?.content ?? "")),
    [doc.data],
  );

  if (doc.isPending) return <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>;
  if (doc.isError) {
    return (
      <Text style={{ color: theme.colors.statusDanger }}>
        {errorText(doc.error)}
      </Text>
    );
  }
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
      {blocks.map((block, index) => (
        <Block key={index} theme={theme} block={block} />
      ))}
    </ScrollView>
  );
}

type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: { marker: string; text: string }[] }
  | { kind: "code"; text: string };

function Block({ theme, block }: { theme: Theme; block: MarkdownBlock }) {
  const text: TextStyle = { color: theme.colors.foreground, fontSize: 13, lineHeight: 20 };
  switch (block.kind) {
    case "heading":
      return (
        <Text
          style={{
            ...text,
            fontSize: HEADING_SIZES[block.level - 1],
            lineHeight: undefined,
            fontWeight: "600",
            marginTop: 6,
          }}
        >
          <Inline theme={theme} text={block.text} />
        </Text>
      );
    case "paragraph":
      return (
        <Text selectable style={text}>
          <Inline theme={theme} text={block.text} />
        </Text>
      );
    case "list":
      return (
        <View style={{ gap: 4 }}>
          {block.items.map((item, index) => (
            <View key={index} style={{ flexDirection: "row", gap: 6 }}>
              <Text style={{ ...text, color: theme.colors.foregroundMuted }}>{item.marker}</Text>
              <Text selectable style={{ ...text, flex: 1 }}>
                <Inline theme={theme} text={item.text} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "code":
      return (
        <ScrollView
          horizontal
          style={{ borderRadius: 6, backgroundColor: theme.colors.surface2 }}
          contentContainerStyle={{ padding: 10 }}
        >
          <Text selectable style={{ ...text, fontFamily: MONO, fontSize: 12 }}>
            {block.text}
          </Text>
        </ScrollView>
      );
  }
}

/** Inline `code` and **bold** only; everything else renders as plain text. */
function Inline({ theme, text }: { theme: Theme; text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
          return (
            <Text
              key={index}
              style={{ fontFamily: MONO, fontSize: 12, backgroundColor: theme.colors.surface2 }}
            >
              {part.slice(1, -1)}
            </Text>
          );
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
          return (
            <Text key={index} style={{ fontWeight: "600" }}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        return part;
      })}
    </>
  );
}

function stripFrontmatter(content: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(content);
  return match ? content.slice(match[0].length) : content;
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.split(/\r?\n/);
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      flushParagraph();
      const code: string[] = [];
      while (++i < lines.length && !lines[i].trimStart().startsWith("```")) code.push(lines[i]);
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }
    const item = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      const marker = /\d/.test(item[1]) ? item[1] : "•";
      const last = blocks[blocks.length - 1];
      if (last?.kind === "list") last.items.push({ marker, text: item[2] });
      else blocks.push({ kind: "list", items: [{ marker, text: item[2] }] });
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    // A wrapped continuation line of a list item stays with that item.
    const last = blocks[blocks.length - 1];
    if (!paragraph.length && last?.kind === "list" && /^\s+/.test(line)) {
      last.items[last.items.length - 1].text += " " + line.trim();
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}
