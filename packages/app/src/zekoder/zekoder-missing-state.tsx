import { router } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";
import { isProvisionableStatus } from "./host-provisioning";
import { useHostZekoder } from "./use-host-zekoder";

/** Shown in place of a Zekoder surface when the route's host has no `zekoder` plugin. */
export function ZekoderMissingState({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { status, error, provision, isProvisioning } = useHostZekoder(serverId);
  const onProvision = useCallback(() => {
    void provision();
  }, [provision]);
  const openPlugins = useCallback(() => {
    router.push(buildSettingsHostSectionRoute(serverId, "plugins"));
  }, [serverId]);

  if (status === "present" || status === "unknown") {
    return (
      <View style={styles.container}>
        <Alert
          variant="error"
          title={t("zekoder.hostProvisioning.states.unavailable")}
          testID="zekoder-missing-state"
        />
      </View>
    );
  }
  if (status === "unsupported") {
    return (
      <View style={styles.container}>
        <Alert
          variant="warning"
          title={t("zekoder.hostProvisioning.states.updateTitle")}
          description={t("zekoder.hostProvisioning.states.updateDescription")}
          testID="zekoder-missing-state"
        />
      </View>
    );
  }
  if (status === "failed") {
    return (
      <View style={styles.container}>
        <Alert
          variant="error"
          title={t("zekoder.hostProvisioning.states.failedTitle")}
          description={error ?? undefined}
          testID="zekoder-missing-state"
        >
          <Button variant="outline" size="sm" onPress={openPlugins}>
            {t("zekoder.hostProvisioning.actions.openPlugins")}
          </Button>
        </Alert>
      </View>
    );
  }
  if (!isProvisionableStatus(status)) return null;
  const installing = status === "install";
  return (
    <View style={styles.container}>
      <Alert
        variant="warning"
        title={t("zekoder.hostProvisioning.states.missingTitle")}
        description={t(
          installing
            ? "zekoder.hostProvisioning.states.installDescription"
            : "zekoder.hostProvisioning.states.enableDescription",
        )}
        testID="zekoder-missing-state"
      >
        <Button
          variant="default"
          size="sm"
          onPress={onProvision}
          disabled={isProvisioning}
          testID="zekoder-provision-button"
        >
          {t(
            installing
              ? "zekoder.hostProvisioning.actions.install"
              : "zekoder.hostProvisioning.actions.enable",
          )}
        </Button>
      </Alert>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    padding: theme.spacing[4],
  },
}));
