// ─── PROJECTS ────────────────────────────────────────────────────────────────
// The container. A contractor does not think "I want Job Cam" — they think
// "I'm working on Starbucks", and everything about Starbucks lives here:
// photos, takeoff, estimate, panel schedule, permit, inspections, notes.
//
// Job Cam is now the camera INSIDE a project. It was a good name for a camera
// and a bad name for a filing system.
//
// The old Job Cam kept its own separate project list and photo store, which
// this screen never read — so a user with photos there could not see them here.
// They are folded in on load, once, without losing any (see projectMerge.js).

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  project, photo, ProjectTemplate, TEMPLATES, PhotoTag,
  addPhoto, tagPhoto, setFolder, togglePinned,
  photosInFolder, beforeAfterPairs, projectStats, missingShots,
} from '../core/domain/jobcam';
import {
  mergeJobCamIntoProjects, migrationMessage, legacyStoreIsFullyMigrated,
} from '../core/domain/projectMerge';
import {
  hydrate, hubOverview, completeness, deletionImpact, setCustomer, setAddress, emptyWorld,
} from '../core/domain/projectHub';
import {
  dailyLog, crewEntry, upsertLog, logsForProject, logForDate, logOverview,
  parseMinutes, renderLogText, Weather, WEATHER_LABEL,
} from '../core/domain/dailyLog';
import { buildExport, renderExportText, exportSummary, Audience, AUDIENCE_LABEL } from '../core/domain/projectExport';
import { lifecycle, timeline, timelineText, EventKind } from '../core/domain/lifecycle';
import { intelligenceReport } from '../core/domain/fieldIntelligence';
import { readScoped, LegacyAdapters } from '../core/domain/scopedStore';

const KEY = '@sc_projects_v1';
const LOGS_KEY = '@sc_daily_logs_v1';
// Stores owned by other screens. The hub READS them by projectId; it never
// writes them, so each tool keeps its own lifecycle and there is one copy of
// every number.
const MATERIALS_KEY = '@sc_material_lists_v1';
const PANEL_KEY = '@sc_panel_v1';
const ACTIVE_KEY = '@sc_active_project_v1';

const today = () => new Date().toISOString().slice(0, 10);

// The old Job Cam store. Read on load and folded in; never written to again.
const LEGACY_PROJECTS_KEY = '@sc_cam_projects';
const LEGACY_PHOTOS_KEY = '@sc_cam_photos';
const LEGACY_MIGRATED_KEY = '@sc_cam_migrated_at';
const nowIso = () => new Date().toISOString();

const loadPicker = async () => {
  try { return await import('expo-image-picker'); } catch { return null; }
};

export default function ProjectsScreen({ C, setTab }) {
  const [projects, setProjects] = useState(null);
  const [logs, setLogs] = useState([]);
  const [linked, setLinked] = useState({ materialLists: [], panels: [] });
  const [openId, setOpenId] = useState(null);
  const [migrationNote, setMigrationNote] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [rawLogs, rawMaterials, rawPanel] = await Promise.all([
          AsyncStorage.getItem(LOGS_KEY),
          AsyncStorage.getItem(MATERIALS_KEY),
          AsyncStorage.getItem(PANEL_KEY),
        ]);
        setLogs(rawLogs ? JSON.parse(rawLogs) : []);
        setLinked({
          materialLists: readScoped(rawMaterials, { legacyToRecord: LegacyAdapters.materials }).records,
          panels: readScoped(rawPanel, { legacyToRecord: LegacyAdapters.panel }).records,
        });
      } catch (e) { setLogs([]); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        // Every project is brought up to the hub shape on read. `hydrate` only
        // adds absent fields, so a record that predates the hub keeps everything
        // it had — and running it on every load stays safe.
        const current = (raw ? JSON.parse(raw) : []).map(hydrate).filter(Boolean);

        // Job Cam used to keep its own project list and its own photos, in a
        // separate store this screen never read. A user with photos there could
        // not see them here and nothing said so. Fold them in on load.
        //
        // The legacy keys are deliberately NOT cleared. They are the only copy
        // until we can prove every photo landed, and `legacyStoreIsFullyMigrated`
        // is what proves it — deleting the source because a migration looked
        // fine is how photos disappear.
        const [camProjects, camPhotos] = await Promise.all([
          AsyncStorage.getItem(LEGACY_PROJECTS_KEY),
          AsyncStorage.getItem(LEGACY_PHOTOS_KEY),
        ]);

        if (camProjects || camPhotos) {
          const { projects: merged, report } = mergeJobCamIntoProjects(current, camProjects, camPhotos);
          if (!report.nothingToDo) {
            setProjects(merged);
            setMigrationNote(migrationMessage(report));
            try { await AsyncStorage.setItem(KEY, JSON.stringify(merged)); } catch (e) { /* ignore */ }
            if (legacyStoreIsFullyMigrated(merged, camPhotos)) {
              try { await AsyncStorage.setItem(LEGACY_MIGRATED_KEY, String(Date.now())); } catch (e) { /* ignore */ }
            }
            return;
          }
        }
        setProjects(current);
      } catch (e) { setProjects([]); }
    })();
  }, []);

  // A swallowed write is worse here than anywhere else in the app. React state
  // updates either way, so the user watches their daily log appear in the list,
  // closes the app, and finds it gone — with nothing having said a word. On a
  // record that exists to settle a billing dispute, that is the failure mode
  // that matters most, and it is exactly what a full storage quota produces.
  const persistTo = async (key, next, what) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(next));
      return true;
    } catch (e) {
      Alert.alert(
        'Not saved',
        `${what} could not be written to this device — storage may be full. `
        + 'It is still on screen, so copy anything you cannot lose before closing the app.',
      );
      return false;
    }
  };

  const persist = async (next) => {
    setProjects(next);
    return persistTo(KEY, next, 'This project');
  };

  const persistLogs = async (next) => {
    setLogs(next);
    return persistTo(LOGS_KEY, next, 'This daily log');
  };

  if (!projects) return null;

  // Everything stored elsewhere that points back at a job. Estimates, invoices
  // and permits keep their own stores and their own lifecycles; the hub reads
  // them, it does not own them.
  const world = { ...emptyWorld(), logs, materialLists: linked.materialLists };

  const open = projects.find((p) => p.id === openId);
  if (open) {
    return (
      <ProjectDetail
        C={C}
        proj={open}
        world={world}
        setTab={setTab}
        onChange={(next) => persist(projects.map((p) => (p.id === next.id ? next : p)))}
        onLogsChange={persistLogs}
        allLogs={logs}
        onExit={() => setOpenId(null)}
        onDelete={() => {
          // Say what actually dies and what merely gets orphaned. The old copy
          // promised only that the photo files survive and stayed silent about
          // the invoice, which is the thing a user most wants to know about.
          const impact = deletionImpact(open, world);
          Alert.alert(
            'Delete project?',
            [impact.summary, impact.orphanSummary, impact.note].filter(Boolean).join('\n\n'),
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => { persist(projects.filter((p) => p.id !== open.id)); setOpenId(null); } },
            ],
          );
        }}
      />
    );
  }

  return (
    <ProjectList
      C={C} projects={projects} onCreate={persist} setTab={setTab}
      onOpen={(id) => {
        setOpenId(id);
        // Opening a job makes it the active scope, so the material list and the
        // panel schedule save into THIS job rather than into the unfiled one.
        AsyncStorage.setItem(ACTIVE_KEY, String(id)).catch(() => {});
      }}
      migrationNote={migrationNote}
      onDismissNote={() => setMigrationNote(null)}
    />
  );
}

// ─── List + create ───────────────────────────────────────────────────────────

function ProjectList({ C, projects, onOpen, onCreate, setTab, migrationNote, onDismissNote }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState(ProjectTemplate.SERVICE_CALL);

  const create = () => {
    const clean = name.trim();
    if (!clean) return;
    const p = project({ id: `p${Date.now()}`, name: clean, template, createdAt: nowIso() });
    onCreate([p, ...projects]);
    setName(''); setCreating(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 44 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.tealBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="folder-open" size={20} color={C.teal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Projects</Text>
          <Text style={{ fontSize: 12, color: C.textTert }}>Job records you can defend an inspection with</Text>
        </View>
      </View>

      {/* Photos that were in the old Job Cam store now live here. Said out loud
          rather than silently: a user who took 40 photos in Job Cam needs to
          know where they went, and needs to see the count to trust it. */}
      {!!migrationNote && (
        <View style={{
          backgroundColor: C.greenBg ?? C.tealBg, borderRadius: 12, padding: 12, marginBottom: 14,
          flexDirection: 'row', gap: 9, alignItems: 'flex-start',
          borderWidth: 1, borderColor: C.green ?? C.teal,
        }}>
          <Ionicons name="albums" size={17} color={C.green ?? C.teal} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.text, marginBottom: 2 }}>
              Job Cam is part of Projects now
            </Text>
            <Text style={{ fontSize: 11.5, color: C.textSec, lineHeight: 16 }}>{migrationNote}</Text>
          </View>
          <TouchableOpacity onPress={onDismissNote} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={16} color={C.textTert} />
          </TouchableOpacity>
        </View>
      )}

      {!creating ? (
        <TouchableOpacity
          onPress={() => setCreating(true)}
          style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 16, minHeight: 50, justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Start a Project</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>PROJECT NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Reyes panel upgrade"
            placeholderTextColor={C.placeholder}
            style={{ backgroundColor: C.inputBg, borderRadius: 10, padding: 12, color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.inputBorder, marginBottom: 12 }}
          />
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>TYPE</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
            {Object.entries(TEMPLATES).map(([key, t]) => {
              const active = template === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setTemplate(key)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, minHeight: 44, justifyContent: 'center',
                    backgroundColor: active ? C.blue : C.inputBg, borderWidth: 1.5, borderColor: active ? C.blue : C.border,
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : C.textSec }}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <TouchableOpacity onPress={create} disabled={!name.trim()}
              style={{ flex: 1, backgroundColor: name.trim() ? C.blue : C.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center', minHeight: 46, justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: name.trim() ? '#fff' : C.textTert }}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setCreating(false); setName(''); }}
              style={{ paddingHorizontal: 18, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}>
              <Text style={{ fontSize: 13, color: C.textSec }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {projects.length === 0 && !creating && (
        <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 }}>Why bother?</Text>
          <Text style={{ fontSize: 12.5, color: C.textSec, lineHeight: 19 }}>
            A photo of a wall is worthless in six months. The same photo tagged “rough-in,
            bedroom 2, before drywall” is what you bill from and what you show an inspector.
            Pick a template and it tells you which shots to take.
          </Text>
        </View>
      )}

      {projects.map((p) => {
        const stats = projectStats(p);
        return (
          <TouchableOpacity
            key={p.id}
            onPress={() => onOpen(p.id)}
            activeOpacity={0.85}
            style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 9, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: C.teal }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{p.name}</Text>
            <Text style={{ fontSize: 11.5, color: C.textTert, marginTop: 3 }}>
              {TEMPLATES[p.template]?.label ?? 'Custom'} · {stats.photoCount} photo{stats.photoCount === 1 ? '' : 's'}
              {stats.untagged > 0 ? ` · ${stats.untagged} untagged` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity onPress={() => setTab && setTab('home')} style={{ padding: 14, alignItems: 'center', marginTop: 8 }}>
        <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600' }}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────────────

const TAG_CHOICES = [
  PhotoTag.BEFORE, PhotoTag.AFTER, PhotoTag.PANEL, PhotoTag.ROUGH_IN, PhotoTag.TRIM,
  PhotoTag.UNDERGROUND, PhotoTag.CONCEALED, PhotoTag.INSPECTION, PhotoTag.LABEL, PhotoTag.DAMAGE,
];

const VIEWS = [
  { id: 'hub', label: 'Job', icon: 'grid' },
  { id: 'timeline', label: 'Timeline', icon: 'time' },
  { id: 'photos', label: 'Photos', icon: 'camera' },
  { id: 'log', label: 'Daily log', icon: 'today' },
  { id: 'export', label: 'Export', icon: 'share' },
];

function ProjectDetail({ C, proj, world, setTab, onChange, onLogsChange, allLogs, onExit, onDelete }) {
  const [view, setView] = useState('hub');
  const [folderId, setFolderId] = useState(proj.folders[0]?.id ?? null);
  const [selected, setSelected] = useState(null);
  const stats = useMemo(() => projectStats(proj), [proj]);
  const pairs = useMemo(() => beforeAfterPairs(proj), [proj]);
  const missing = useMemo(() => missingShots(proj), [proj]);
  const overview = useMemo(() => hubOverview(proj, world, { today: today() }), [proj, world]);
  const done = useMemo(() => completeness(proj, world, { today: today() }), [proj, world]);

  const capture = async (fromLibrary) => {
    const picker = await loadPicker();
    if (!picker) { Alert.alert('Camera unavailable', 'Photo capture needs the full app, not Expo Go web.'); return; }
    try {
      const perm = fromLibrary
        ? await picker.requestMediaLibraryPermissionsAsync()
        : await picker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Allow access to add photos to this project.'); return; }

      const result = fromLibrary
        ? await picker.launchImageLibraryAsync({ quality: 0.7 })
        : await picker.launchCameraAsync({ quality: 0.7 });
      if (result.canceled || !result.assets?.length) return;

      const a = result.assets[0];
      onChange(addPhoto(proj, photo({
        id: `ph${Date.now()}`, uri: a.uri, capturedAt: nowIso(),
        folderId, width: a.width, height: a.height,
      })));
    } catch (e) {
      Alert.alert('Could not add photo', 'Something went wrong opening the camera.');
    }
  };

  const inFolder = photosInFolder(proj, folderId);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 44 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <TouchableOpacity onPress={onExit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.text }}>{proj.name}</Text>
          <Text style={{ fontSize: 11, color: C.textTert }}>
            {proj.address || TEMPLATES[proj.template]?.label || 'Custom'} · {done.done}/{done.total} recorded
          </Text>
        </View>
      </View>

      {/* One job, four ways of working on it. Photos were the whole screen
          before; now they are one drawer of the filing cabinet. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 7 }}>
          {VIEWS.map((v) => {
            const active = view === v.id;
            return (
              <TouchableOpacity key={v.id} onPress={() => setView(v.id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 13, paddingVertical: 10, borderRadius: 18, minHeight: 42,
                  backgroundColor: active ? C.blue : C.surface, borderWidth: 1.5, borderColor: active ? C.blue : C.border,
                }}>
                <Ionicons name={v.icon} size={14} color={active ? '#fff' : C.textSec} />
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: active ? '#fff' : C.textSec }}>{v.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {view === 'hub' && (
        <HubView
          C={C} proj={proj} world={world} overview={overview} done={done} setTab={setTab}
          onChange={onChange} onOpenView={setView} onDelete={onDelete}
        />
      )}

      {view === 'timeline' && (
        <TimelineView C={C} proj={proj} world={world} />
      )}

      {view === 'log' && (
        <DailyLogView
          C={C} proj={proj} allLogs={allLogs} onLogsChange={onLogsChange}
        />
      )}

      {view === 'export' && (
        <ExportView C={C} proj={proj} world={world} />
      )}

      {view !== 'photos' ? null : (
      <>
      {missing.length > 0 && (
        <View style={{ backgroundColor: C.amberBg, borderRadius: 12, padding: 13, marginBottom: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.amber, marginBottom: 5 }}>SHOTS STILL TO TAKE</Text>
          <Text style={{ fontSize: 12.5, color: C.text, lineHeight: 19 }}>{missing.slice(0, 4).join(' · ')}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 9, marginBottom: 14 }}>
        <TouchableOpacity onPress={() => capture(false)}
          style={{ flex: 1, backgroundColor: C.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => capture(true)}
          style={{ paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.border }}>
          <Ionicons name="images-outline" size={19} color={C.textSec} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 7 }}>
          {proj.folders.map((f) => {
            const active = folderId === f.id;
            const n = photosInFolder(proj, f.id).length;
            return (
              <TouchableOpacity key={f.id} onPress={() => setFolderId(f.id)}
                style={{
                  paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18, minHeight: 40, justifyContent: 'center',
                  backgroundColor: active ? C.teal : C.surface, borderWidth: 1.5, borderColor: active ? C.teal : C.border,
                }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : C.textSec }}>
                  {f.label}{n ? ` ${n}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {inFolder.length === 0 && (
        <Text style={{ fontSize: 12.5, color: C.textTert, marginBottom: 14, lineHeight: 19 }}>
          Nothing in this folder yet. Suggested here: {(TEMPLATES[proj.template]?.suggested ?? []).slice(0, 3).join(', ') || 'anything worth remembering'}.
        </Text>
      )}

      {inFolder.map((p) => (
        <View key={p.id} style={{ backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 9, borderWidth: 1, borderColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="image" size={17} color={C.teal} />
            <Text style={{ flex: 1, fontSize: 12.5, color: C.text }}>
              {p.note || p.tags.join(', ') || 'Untagged photo'}
            </Text>
            <TouchableOpacity onPress={() => onChange(togglePinned(proj, p.id))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={p.pinned ? 'bookmark' : 'bookmark-outline'} size={17} color={p.pinned ? C.amber : C.textTert} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelected(selected === p.id ? null : p.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="pricetag-outline" size={17} color={C.textTert} />
            </TouchableOpacity>
          </View>

          {selected === p.id && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {TAG_CHOICES.map((t) => {
                const on = p.tags.includes(t);
                return (
                  <TouchableOpacity key={t} onPress={() => onChange(tagPhoto(proj, p.id, [t]))} disabled={on}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, minHeight: 36, justifyContent: 'center',
                      backgroundColor: on ? C.successBg : C.inputBg, borderWidth: 1, borderColor: on ? C.success : C.border,
                    }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: on ? C.success : C.textSec }}>
                      {t.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      ))}

      </>
      )}
    </ScrollView>
  );
}

// ─── The hub ─────────────────────────────────────────────────────────────────
// Every part of the job, whether it lives on the project or points back at it.

function HubView({ C, proj, world, overview, done, setTab, onChange, onOpenView, onDelete }) {
  const intel = useMemo(() => intelligenceReport(proj, world), [proj, world]);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState(proj.customer?.name ?? '');
  const [phone, setPhone] = useState(proj.customer?.phone ?? '');
  // Named `addressDraft`, not `address`: a `setAddress` local would shadow the
  // imported one and the Save button would quietly set React state instead of
  // writing to the project.
  const [addressDraft, setAddressDraft] = useState(proj.address ?? '');

  const openSection = (s) => {
    if (s.id === 'customer' || s.id === 'address') { setEditing(s.id); return; }
    if (s.id === 'dailyLogs' || s.id === 'labor') { onOpenView('log'); return; }
    if (s.id === 'photos') { onOpenView('photos'); return; }
    if (s.id === 'export') { onOpenView('export'); return; }
    if (s.tab && setTab) setTab(s.tab);
  };

  return (
    <>
      {/* Not a compliance score. It counts what has been written down. */}
      <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 9 }}>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: C.text }}>Recorded so far</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: done.readyToClose ? (C.success ?? C.teal) : C.textSec }}>
            {done.done}/{done.total}
          </Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' }}>
          <View style={{ width: `${done.percent}%`, height: 6, backgroundColor: done.readyToClose ? (C.success ?? C.teal) : C.blue }} />
        </View>
        {done.outstanding.length > 0 && (
          <Text style={{ fontSize: 11.5, color: C.textTert, marginTop: 8, lineHeight: 17 }}>
            Still to record: {done.outstanding.join(' · ')}
          </Text>
        )}
        <Text style={{ fontSize: 10.5, color: C.textTert, marginTop: 8, lineHeight: 15, fontStyle: 'italic' }}>
          {done.disclaimer}
        </Text>
      </View>

      {/* What this job can do next, because of work already done. Offered, not
          applied — nothing crosses a tool boundary without a person tapping it. */}
      {intel.nextMoves.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textTert, letterSpacing: 0.7, marginBottom: 8 }}>
            NEXT MOVES
          </Text>
          {intel.nextMoves.slice(0, 4).map((h) => (
            <TouchableOpacity
              key={h.id}
              onPress={() => h.tab && setTab && setTab(h.tab)}
              activeOpacity={0.85}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 11,
                backgroundColor: C.surface, borderRadius: 12, padding: 13, marginBottom: 7,
                borderWidth: 1, borderColor: C.blue, minHeight: 56,
              }}>
              <Ionicons name="arrow-forward-circle" size={19} color={C.blue} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.text }}>{h.label}</Text>
                <Text style={{ fontSize: 11.5, color: C.textTert, marginTop: 2 }}>
                  {h.fromLabel} → {h.toLabel} · {h.detail}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Work standing on a version that has since been replaced. Without this
          it looks exactly as current as everything else. */}
      {intel.superseded.length > 0 && (
        <View style={{ backgroundColor: C.amberBg, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.amber, marginBottom: 5 }}>
            BUILT ON A REPLACED VERSION
          </Text>
          {intel.superseded.map((s) => (
            <Text key={s.id} style={{ fontSize: 12, color: C.text, lineHeight: 18 }}>
              {s.title} — from {s.builtOn.map((b) => b.title).join(', ')}
            </Text>
          ))}
        </View>
      )}

      {overview.warnings.length > 0 && (
        <View style={{ backgroundColor: C.amberBg, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          {overview.warnings.map((w) => (
            <Text key={w.id} style={{ fontSize: 12, color: C.text, lineHeight: 18 }}>
              <Text style={{ fontWeight: '800', color: C.amber }}>{w.label}: </Text>{w.warn}
            </Text>
          ))}
        </View>
      )}

      {editing && (
        <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.blue }}>
          {editing === 'customer' ? (
            <>
              <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>CUSTOMER</Text>
              <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={C.placeholder}
                style={{ backgroundColor: C.inputBg, borderRadius: 10, padding: 12, color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.inputBorder, marginBottom: 9 }} />
              <TextInput value={phone} onChangeText={setPhone} placeholder="Phone" placeholderTextColor={C.placeholder} keyboardType="phone-pad"
                style={{ backgroundColor: C.inputBg, borderRadius: 10, padding: 12, color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.inputBorder, marginBottom: 12 }} />
            </>
          ) : (
            <>
              <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>SITE ADDRESS</Text>
              <TextInput value={addressDraft} onChangeText={setAddressDraft} placeholder="14 Mill Road" placeholderTextColor={C.placeholder}
                style={{ backgroundColor: C.inputBg, borderRadius: 10, padding: 12, color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.inputBorder, marginBottom: 12 }} />
            </>
          )}
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <TouchableOpacity
              onPress={() => {
                onChange(editing === 'customer'
                  ? setCustomer(proj, { ...(proj.customer ?? {}), name, phone })
                  : setAddress(proj, addressDraft));
                setEditing(null);
              }}
              style={{ flex: 1, backgroundColor: C.blue, borderRadius: 10, paddingVertical: 13, alignItems: 'center', minHeight: 46, justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditing(null)}
              style={{ paddingHorizontal: 18, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}>
              <Text style={{ fontSize: 13, color: C.textSec }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {overview.groups.map((g) => (
        <View key={g.group} style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textTert, letterSpacing: 0.7, marginBottom: 8 }}>
            {g.group.toUpperCase()}
          </Text>
          {g.sections.map((s) => (
            <TouchableOpacity
              key={s.id}
              onPress={() => openSection(s)}
              activeOpacity={0.85}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 11,
                backgroundColor: C.surface, borderRadius: 12, padding: 13, marginBottom: 7,
                borderWidth: 1, borderColor: s.warn ? C.amber : C.border, minHeight: 56,
              }}>
              <View style={{
                width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                backgroundColor: s.present ? C.tealBg : C.inputBg,
              }}>
                <Ionicons name={s.icon} size={16} color={s.present ? C.teal : C.textTert} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.text }}>{s.label}</Text>
                {/* The count is the useful part; the warning is extra. Showing
                    the warning INSTEAD would hide "2 days logged" behind
                    "nothing logged today". */}
                <Text style={{ fontSize: 11.5, color: C.textTert, marginTop: 2 }}>{s.detail}</Text>
                {!!s.warn && (
                  <Text style={{ fontSize: 11, color: C.amber, marginTop: 2, fontWeight: '600' }}>{s.warn}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.textTert} />
            </TouchableOpacity>
          ))}
        </View>
      ))}

      <TouchableOpacity onPress={onDelete} style={{ padding: 14, alignItems: 'center', marginTop: 4 }}>
        <Text style={{ color: C.danger, fontSize: 13, fontWeight: '600' }}>Delete Project</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────────
// One job, one thread, forever. Stages are the spine; everything else hangs off
// it. Grouped by year so the three quiet years between a fit-out and the call
// about a tripping breaker can be scrolled past.

function TimelineView({ C, proj, world }) {
  const life = useMemo(() => lifecycle(proj, world), [proj, world]);
  const tl = useMemo(() => timeline(proj, world), [proj, world]);

  const share = async () => {
    try { await Share.share({ message: timelineText(tl) }); } catch (e) { /* cancelled */ }
  };

  return (
    <>
      <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 2 }}>{life.current.label}</Text>
        <Text style={{ fontSize: 11.5, color: C.textTert }}>
          {life.current.detail}
          {life.elapsedDays !== null ? ` · ${life.elapsedDays} day${life.elapsedDays === 1 ? '' : 's'} of history` : ''}
        </Text>

        {/* Stages the job passed over. Not an error — material before permit is
            normal — so it reads as a gap, not a failure. */}
        {life.gaps.length > 0 && (
          <Text style={{ fontSize: 11.5, color: C.amber, marginTop: 8, lineHeight: 17 }}>
            Never recorded: {life.gaps.map((g) => g.label).join(', ')}
          </Text>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {life.stages.map((s) => (
            <View key={s.id} style={{
              alignItems: 'center', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10, minWidth: 76,
              backgroundColor: s.reached ? C.tealBg : C.inputBg,
              borderWidth: 1.5, borderColor: s.id === life.current.id ? C.teal : 'transparent',
            }}>
              <Ionicons name={s.icon} size={15} color={s.reached ? C.teal : C.textTert} />
              <Text style={{ fontSize: 10.5, fontWeight: '700', color: s.reached ? C.text : C.textTert, marginTop: 4 }}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {tl.years.map((group) => (
        <View key={group.year} style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.textTert, letterSpacing: 0.7, marginBottom: 8 }}>
            {group.year} · {group.count} event{group.count === 1 ? '' : 's'}
          </Text>
          {group.events.map((e) => {
            const isStage = e.kind === EventKind.STAGE;
            return (
              <View key={e.id} style={{
                flexDirection: 'row', gap: 10, alignItems: 'flex-start',
                paddingVertical: 9, paddingHorizontal: 11, marginBottom: 5, borderRadius: 10,
                backgroundColor: isStage ? C.tealBg : C.surface,
                borderWidth: 1, borderColor: isStage ? 'transparent' : C.border,
              }}>
                <Ionicons name={e.icon ?? 'ellipse'} size={14} color={isStage ? C.teal : C.textTert} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: isStage ? '800' : '600', color: C.text }}>{e.title}</Text>
                  {!!e.summary && <Text style={{ fontSize: 11, color: C.textTert, marginTop: 2 }}>{e.summary}</Text>}
                </View>
                <Text style={{ fontSize: 10.5, color: C.textTert }}>
                  {new Date(e.at).toISOString().slice(5, 10)}
                </Text>
              </View>
            );
          })}
        </View>
      ))}

      {/* Undated records are shown, never dropped and never dated to 1970. */}
      {tl.undated.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.textTert, letterSpacing: 0.7, marginBottom: 8 }}>
            UNDATED · {tl.undated.length}
          </Text>
          {tl.undated.map((e) => (
            <Text key={e.id} style={{ fontSize: 11.5, color: C.textSec, paddingVertical: 4 }}>{e.title}</Text>
          ))}
        </View>
      )}

      {tl.count === 0 && (
        <Text style={{ fontSize: 12.5, color: C.textTert, lineHeight: 19 }}>
          Nothing on this job yet. Every photo, log, calculation, permit and invoice lands here
          automatically — including the service call three years from now.
        </Text>
      )}

      <TouchableOpacity onPress={share}
        style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.textSec }}>Share the job history</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── Daily log ───────────────────────────────────────────────────────────────

function DailyLogView({ C, proj, allLogs, onLogsChange }) {
  const date = today();
  const existing = logForDate(allLogs, proj.id, date);
  const mine = logsForProject(allLogs, proj.id);
  const summary = useMemo(() => logOverview(allLogs, proj.id, { today: date }), [allLogs, proj.id, date]);

  const [crewName, setCrewName] = useState('');
  const [hours, setHours] = useState('');
  const [work, setWork] = useState(existing?.workPerformed ?? '');
  const [weather, setWeather] = useState(existing?.weather ?? null);

  const save = () => {
    const minutes = parseMinutes(hours);
    // Editing today's log replaces it. There is no path that appends a second
    // log for the same date, because that would double the billable hours.
    const crew = [
      ...(existing?.crew ?? []),
      ...(crewName.trim() ? [crewEntry({ name: crewName, minutes })] : []),
    ];
    const log = dailyLog({
      projectId: proj.id, date, crew, weather,
      workPerformed: work,
      delays: existing?.delays ?? [],
      deliveries: existing?.deliveries ?? '',
      visitors: existing?.visitors ?? '',
    });
    onLogsChange(upsertLog(allLogs, log));
    setCrewName(''); setHours('');
  };

  return (
    <>
      <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 3 }}>Today · {date}</Text>
        <Text style={{ fontSize: 11.5, color: C.textTert, marginBottom: 12 }}>
          {summary.count} day{summary.count === 1 ? '' : 's'} logged · {summary.labor.totalHoursLabel} on site
          {summary.labor.priced ? ` · ${summary.labor.costLabel}` : ''}
        </Text>

        <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>ADD CREW TIME</Text>
        <View style={{ flexDirection: 'row', gap: 9, marginBottom: 10 }}>
          <TextInput value={crewName} onChangeText={setCrewName} placeholder="Name" placeholderTextColor={C.placeholder}
            style={{ flex: 2, backgroundColor: C.inputBg, borderRadius: 10, padding: 12, color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.inputBorder }} />
          <TextInput value={hours} onChangeText={setHours} placeholder="8 or 7:30" placeholderTextColor={C.placeholder}
            style={{ flex: 1, backgroundColor: C.inputBg, borderRadius: 10, padding: 12, color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.inputBorder }} />
        </View>

        <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>WEATHER</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {Object.keys(Weather).map((w) => {
            const on = weather === w;
            return (
              <TouchableOpacity key={w} onPress={() => setWeather(on ? null : w)}
                style={{
                  paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, minHeight: 38, justifyContent: 'center',
                  backgroundColor: on ? C.teal : C.inputBg, borderWidth: 1, borderColor: on ? C.teal : C.border,
                }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: on ? '#fff' : C.textSec }}>{WEATHER_LABEL[w]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>WORK PERFORMED</Text>
        <TextInput value={work} onChangeText={setWork} multiline placeholder="What got done today"
          placeholderTextColor={C.placeholder}
          style={{ backgroundColor: C.inputBg, borderRadius: 10, padding: 12, color: C.inputText, fontSize: 14, borderWidth: 1, borderColor: C.inputBorder, minHeight: 76, textAlignVertical: 'top', marginBottom: 12 }} />

        <TouchableOpacity onPress={save}
          style={{ backgroundColor: C.blue, borderRadius: 10, paddingVertical: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>
            {existing ? 'Update today’s log' : 'Save today’s log'}
          </Text>
        </TouchableOpacity>
      </View>

      {!summary.labor.priced && summary.labor.pricingNote && (
        <Text style={{ fontSize: 11.5, color: C.textTert, marginBottom: 14, lineHeight: 17 }}>
          {summary.labor.pricingNote}
        </Text>
      )}

      {mine.map((l) => (
        <View key={l.id} style={{ backgroundColor: C.surface, borderRadius: 12, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontSize: 12, color: C.text, lineHeight: 18 }}>{renderLogText(l)}</Text>
        </View>
      ))}

      {mine.length === 0 && (
        <Text style={{ fontSize: 12.5, color: C.textTert, lineHeight: 19 }}>
          No days logged yet. A log written on the day is what settles an argument six months later —
          who was here, how long, and what stopped the work.
        </Text>
      )}
    </>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

function ExportView({ C, proj, world }) {
  const [audience, setAudience] = useState(Audience.CUSTOMER);
  const pkg = useMemo(
    () => buildExport(proj, world, { audience, today: today() }),
    [proj, world, audience],
  );
  const text = useMemo(() => renderExportText(pkg), [pkg]);

  const send = async () => {
    try { await Share.share({ message: text }); } catch (e) { /* user cancelled */ }
  };

  return (
    <>
      <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>WHO IS THIS FOR</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
        {Object.keys(Audience).map((a) => {
          const on = audience === a;
          return (
            <TouchableOpacity key={a} onPress={() => setAudience(a)}
              style={{
                paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10, minHeight: 42, justifyContent: 'center',
                backgroundColor: on ? C.blue : C.inputBg, borderWidth: 1.5, borderColor: on ? C.blue : C.border,
              }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: on ? '#fff' : C.textSec }}>{AUDIENCE_LABEL[a]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* The reader decides what is in the document, so say what is being held
          back before it is sent, not after. */}
      <Text style={{ fontSize: 11.5, color: C.textTert, marginBottom: 12, lineHeight: 17 }}>
        {exportSummary(pkg)}
        {pkg?.omitted?.length ? ` — withheld: ${pkg.omitted.join(', ')}` : ''}
      </Text>

      <View style={{ backgroundColor: C.surface, borderRadius: 12, padding: 13, marginBottom: 14, borderWidth: 1, borderColor: C.border }}>
        <Text style={{ fontSize: 11.5, color: C.text, lineHeight: 17, fontFamily: undefined }}>{text}</Text>
      </View>

      <TouchableOpacity onPress={send}
        style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Share this copy</Text>
      </TouchableOpacity>
    </>
  );
}
