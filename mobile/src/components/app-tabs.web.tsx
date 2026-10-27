import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { StyleSheet, Text } from 'react-native';
import { palette } from '@/constants/design';

export default function AppTabs() {
  return (
    <Tabs style={styles.container}>
      <TabSlot style={styles.content} />
      <TabList style={styles.tabList}>
        <TabTrigger name="home" href="/home" style={styles.tab}><Text style={styles.label}>Inicio</Text></TabTrigger>
        <TabTrigger name="planner" href="/planner" style={styles.tab}><Text style={styles.label}>Planificador</Text></TabTrigger>
        <TabTrigger name="history" href="/history" style={styles.tab}><Text style={styles.label}>Historial</Text></TabTrigger>
        <TabTrigger name="recipes" href="/recipes" style={styles.tab}><Text style={styles.label}>Recetas</Text></TabTrigger>
        <TabTrigger name="profile" href="/profile" style={styles.tab}><Text style={styles.label}>Perfil</Text></TabTrigger>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { flex: 1 },
  tabList: { backgroundColor: palette.surface, borderTopWidth: 1, borderColor: palette.border, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', padding: 8, gap: 4 },
  tab: { paddingVertical: 14, paddingHorizontal: 12, minHeight: 48 },
  label: { color: palette.green, fontSize: 13, fontWeight: '600' },
});
