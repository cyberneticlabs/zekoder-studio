import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { ScrollView, TextInput } from "@getpaseo/plugin/client/react-native";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { DEFAULT_REPORT_DAYS, MAX_REPORT_DAYS, REPORT_DAYS_ERROR, reportDaysSchema, reportSettings, validateOrgRpc } from "../shared/reports.js";
import { errorText } from "../shared/errors.js";
import { Button } from "./button.js";
import { inputStyle } from "./styles.js";

type Theme = PluginSurfaceProps["theme"];

/**
 * Report parameters: the GitHub org and how many days back. The org is only persisted after the
 * daemon's `gh` confirms it exists and is accessible; the canonical login is what gets saved.
 */
export function ReportSettingsPanel({ theme }: { theme: Theme }) {
  const validateOrg = useRpc(validateOrgRpc);
  const settings = useSettings(reportSettings);
  const [org, setOrg] = useState("");
  const [days, setDays] = useState("");
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || settings.status === "loading" || settings.status === "error") return;
    hydrated.current = true;
    setOrg(settings.status === "ready" ? (settings.values.org ?? "") : "");
    setDays(String(settings.status === "ready" ? settings.values.days : DEFAULT_REPORT_DAYS));
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      if (settings.status !== "ready" && settings.status !== "invalid") throw new Error("Settings are still loading.");
      const parsedDays = Number(days.trim());
      if (!reportDaysSchema.safeParse(parsedDays).success) throw new Error(REPORT_DAYS_ERROR);
      const trimmed = org.trim();
      if (!trimmed) throw new Error("Enter a GitHub org name.");
      const { login } = await validateOrg({ org: trimmed });
      if (!(await settings.save({ org: login, days: parsedDays }, settings.revision))) {
        throw new Error(settings.saveError ?? "Could not save the settings.");
      }
      setOrg(login);
      setDays(String(parsedDays));
      return login;
    },
  });

  const muted = { color: theme.colors.foregroundMuted };
  const saved = settings.status === "ready" ? settings.values : null;
  // Invalid stored settings can always be overwritten.
  const dirty = saved === null || org.trim() !== (saved.org ?? "") || days.trim() !== String(saved.days);

  if (settings.status === "loading") return <Text style={muted}>Loading…</Text>;
  if (settings.status === "error") return <Text style={{ color: theme.colors.statusDanger }}>{settings.error}</Text>;

  return (
    <ScrollView contentContainerStyle={{ gap: 20 }}>
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", ...muted }}>CODING HEALTH</Text>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, color: theme.colors.foreground }}>GitHub organization</Text>
          <TextInput
            value={org}
            onChangeText={setOrg}
            placeholder="e.g. cyberneticlabs"
            placeholderTextColor={theme.colors.foregroundMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ ...inputStyle(theme), maxWidth: 320 }}
          />
          <Text style={{ fontSize: 11, ...muted }}>
            Checked with the gh login on the Paseo host before saving.
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, color: theme.colors.foreground }}>Days back</Text>
          <TextInput
            value={days}
            onChangeText={setDays}
            keyboardType="numeric"
            style={{ ...inputStyle(theme), width: 120 }}
          />
          <Text style={{ fontSize: 11, ...muted }}>
            1–{MAX_REPORT_DAYS}. The window ends the day before yesterday (UTC).
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Button
            theme={theme}
            icon="Check"
            label={save.isPending ? "Checking…" : "Save"}
            primary
            disabled={save.isPending || !dirty}
            onPress={() => save.mutate()}
          />
          {save.isSuccess && !dirty && (
            <Text style={{ fontSize: 12, color: theme.colors.statusSuccess }}>Saved ({save.data}).</Text>
          )}
        </View>
        {save.isError && <Text style={{ color: theme.colors.statusDanger }}>{errorText(save.error)}</Text>}
        {settings.status === "invalid" && (
          <Text style={{ color: theme.colors.statusWarning }}>Stored settings were invalid: {settings.error}</Text>
        )}
      </View>
    </ScrollView>
  );
}
