import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { copyText, Icon, Modal, ScrollView } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  canImplement,
  canPromote,
  EXECUTABLE_TYPES,
  getIssueRpc,
  implementCommand,
  implementIssueRpc,
  type ItemType,
  promoteIdeaRpc,
  type ZekoderField,
  type ZekoderPackage,
  type ZekoderRelation,
} from "../shared/issues.js";
import { errorText } from "../shared/errors.js";
import { Button } from "./button.js";
import { DocViewer, docName } from "./doc-viewer.js";
import { statusColor } from "./issue-row.js";
import { StartAgentButton } from "./start-agent-button.js";

type Theme = PluginSurfaceProps["theme"];
type Navigation = PluginSurfaceProps["navigation"];

interface IssueDetailProps {
  theme: Theme;
  root: string;
  /** The workspace showing this tab; agents start there, not in the project root. */
  workspaceId?: string;
  id: string;
  type: ItemType;
  /** Host navigation, used to jump to the agent the Implement button starts. */
  navigation?: Navigation;
  /** Omitted when a host container (the compact-layout modal) already owns closing. */
  onClose?(): void;
  /** Show an opened doc in place of the details (compact layout, already inside a modal). */
  inlineDocs?: boolean;
}

/** Metadata + packages of one item. Rendered as a side panel on wide layouts, in a modal on compact ones. */
export function IssueDetail({ theme, root, workspaceId, id, type, navigation, onClose, inlineDocs }: IssueDetailProps) {
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const fetchIssue = useRpc(getIssueRpc);
  const implement = useRpc(implementIssueRpc);
  const promote = useRpc(promoteIdeaRpc);
  const detail = useQuery({
    queryKey: ["zekoder", "issue", root, type, id],
    queryFn: () => fetchIssue({ root, id, type }),
  });
  const issue = detail.data?.issue;
  const muted = { color: theme.colors.foregroundMuted };

  if (inlineDocs && openDoc) {
    return (
      <View style={{ flex: 1, gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to details"
          onPress={() => setOpenDoc(null)}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Icon name="ArrowLeft" size={16} color={theme.colors.foregroundMuted} />
          <Text style={{ fontSize: 16, fontWeight: "600", color: theme.colors.foreground }}>
            {docName(openDoc)}
          </Text>
        </Pressable>
        <DocViewer theme={theme} root={root} path={openDoc} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: theme.colors.foreground }}>
            {issue?.title ?? id}
          </Text>
          <Text style={{ fontSize: 12, ...muted }}>
            {type} {id}
            {issue ? " · " : ""}
            {issue ? (
              <Text style={{ color: statusColor(issue.status, theme) }}>{issue.status}</Text>
            ) : null}
          </Text>
        </View>
        {onClose && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close details"
            onPress={onClose}
          >
            <Icon name="X" size={16} color={theme.colors.foregroundMuted} />
          </Pressable>
        )}
      </View>

      {issue && EXECUTABLE_TYPES.includes(type) && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <StartAgentButton
            theme={theme}
            icon="Play"
            label="Implement"
            enabled={canImplement(type, issue.status)}
            disabledHint="Only planned items can be implemented."
            navigation={navigation}
            root={root}
            start={() => implement({ root, id, type, workspaceId })}
          />
          <CopyCommandButton theme={theme} id={id} />
        </View>
      )}

      {issue && type === "idea" && (
        <StartAgentButton
          theme={theme}
          icon="Sparkles"
          label="Promote idea"
          enabled={canPromote(type, issue.status)}
          disabledHint="Only captured ideas can be promoted."
          navigation={navigation}
          root={root}
          start={() => promote({ root, id, workspaceId })}
        />
      )}

      {detail.isPending && <Text style={muted}>Loading…</Text>}
      {detail.isError && (
        <Text style={{ color: theme.colors.statusDanger }}>
          {errorText(detail.error)}
        </Text>
      )}

      {issue && (
        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 16 }}>
          <Section theme={theme} title="Details">
            <FieldList
              theme={theme}
              fields={[{ key: "path", value: issue.path }, ...issue.fields]}
            />
          </Section>

          {issue.relations.length > 0 && (
            <Section theme={theme} title="Relations">
              <RelationList theme={theme} relations={issue.relations} />
            </Section>
          )}

          {(type === "feature" || issue.packages.length > 0) && (
            <Section theme={theme} title={`Packages (${issue.packages.length})`}>
              {issue.packages.length === 0 ? (
                <Text style={muted}>No packages.</Text>
              ) : (
                issue.packages.map((pkg) => (
                  <PackageRow
                    key={pkg.id}
                    theme={theme}
                    pkg={pkg}
                    doc={packageDoc(pkg, issue.docs)}
                    onOpenDoc={setOpenDoc}
                  />
                ))
              )}
            </Section>
          )}

          {issue.docs.length > 0 && (
            <Section theme={theme} title={`Documents (${issue.docs.length})`}>
              {issue.docs.map((doc) => (
                <DocLink key={doc} theme={theme} path={doc} onPress={() => setOpenDoc(doc)} />
              ))}
            </Section>
          )}
        </ScrollView>
      )}

      {!inlineDocs && (
        <Modal
          title={openDoc ? docName(openDoc) : ""}
          icon={<Icon name="FileText" size={16} color={theme.colors.foregroundMuted} />}
          open={openDoc !== null}
          onOpenChange={(open) => !open && setOpenDoc(null)}
        >
          <Modal.Content scrollable={false} style={{ flex: 1 }}>
            {openDoc && <DocViewer theme={theme} root={root} path={openDoc} />}
          </Modal.Content>
        </Modal>
      )}
    </View>
  );
}

/** Copies `/zekoder-implement {id}` to the clipboard, for running by hand. Enabled for every status. */
function CopyCommandButton({ theme, id }: { theme: Theme; id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useMutation({
    mutationFn: () => copyText(implementCommand(id)),
    onSuccess: () => setCopied(true),
  });
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <View style={{ gap: 4, alignItems: "flex-start" }}>
      <Button
        theme={theme}
        icon="Copy"
        label={copied ? "Copied" : "Copy command"}
        onPress={() => copy.mutate()}
      />
      {copy.isError && (
        <Text style={{ fontSize: 12, color: theme.colors.statusDanger }}>
          {errorText(copy.error)}
        </Text>
      )}
    </View>
  );
}

function DocLink({ theme, path, onPress }: { theme: Theme; path: string; onPress(): void }) {
  const name = docName(path);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 }}
    >
      <Icon name="FileText" size={14} color={theme.colors.foregroundMuted} />
      <Text style={{ fontSize: 12, color: theme.colors.accent }}>{name}</Text>
    </Pressable>
  );
}

/** A package's `file` is relative to its feature folder; match it against the item's doc paths. */
function packageDoc(pkg: ZekoderPackage, docs: string[]): string | undefined {
  const file = pkg.fields.find((field) => field.key === "file")?.value;
  return file ? docs.find((doc) => doc.endsWith("/" + file)) : undefined;
}

interface PackageRowProps {
  theme: Theme;
  pkg: ZekoderPackage;
  doc?: string;
  onOpenDoc(path: string): void;
}

function PackageRow({ theme, pkg, doc, onOpenDoc }: PackageRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = pkg.fields.length > 0 || pkg.relations.length > 0 || doc !== undefined;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Package ${pkg.id} ${pkg.name}`}
        disabled={!hasDetails}
        onPress={() => setExpanded((value) => !value)}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10 }}
      >
        <Icon
          name={expanded ? "ChevronDown" : "ChevronRight"}
          size={14}
          color={hasDetails ? theme.colors.foregroundMuted : "transparent"}
        />
        <Text style={{ flex: 1, color: theme.colors.foreground }}>
          {pkg.id} · {pkg.name}
        </Text>
        <Text style={{ fontSize: 12, color: statusColor(pkg.status, theme) }}>{pkg.status}</Text>
      </Pressable>
      {expanded && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 10, gap: 8 }}>
          <FieldList theme={theme} fields={pkg.fields} />
          <RelationList theme={theme} relations={pkg.relations} />
          {doc && <DocLink theme={theme} path={doc} onPress={() => onOpenDoc(doc)} />}
        </View>
      )}
    </View>
  );
}

function Section({
  theme,
  title,
  children,
}: {
  theme: Theme;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.foregroundMuted }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function FieldList({ theme, fields }: { theme: Theme; fields: ZekoderField[] }) {
  return (
    <View style={{ gap: 4 }}>
      {fields.map((field) => (
        <View key={field.key} style={{ flexDirection: "row", gap: 8 }}>
          <Text style={{ width: 110, fontSize: 12, color: theme.colors.foregroundMuted }}>
            {field.key}
          </Text>
          <Text selectable style={{ flex: 1, fontSize: 12, color: theme.colors.foreground }}>
            {field.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function RelationList({ theme, relations }: { theme: Theme; relations: ZekoderRelation[] }) {
  return (
    <FieldList
      theme={theme}
      fields={relations.map(({ key, ids }) => ({ key, value: ids.join("\n") }))}
    />
  );
}
