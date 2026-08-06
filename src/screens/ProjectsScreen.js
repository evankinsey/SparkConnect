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
import { projectOverview } from '../core/domain/projectArtifacts';

const KEY = '@sc_projects_v1';

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
  const [openId, setOpenId] = useState(null);
  const [migrationNote, setMigrationNote] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const current = raw ? JSON.parse(raw) : [];

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

  const persist = async (next) => {
    setProjects(next);
    try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  };

  if (!projects) return null;

  const open = projects.find((p) => p.id === openId);
  if (open) {
    return (
      <ProjectDetail
        C={C}
        proj={open}
        onChange={(next) => persist(projects.map((p) => (p.id === next.id ? next : p)))}
        onExit={() => setOpenId(null)}
        onDelete={() => {
          Alert.alert('Delete project?', `"${open.name}" and its ${open.photos.length} photo reference(s) will be removed from SparkConnect. The photos themselves stay on your device.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => { persist(projects.filter((p) => p.id !== open.id)); setOpenId(null); } },
          ]);
        }}
      />
    );
  }

  return (
    <ProjectList
      C={C} projects={projects} onOpen={setOpenId} onCreate={persist} setTab={setTab}
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

function ProjectDetail({ C, proj, onChange, onExit, onDelete }) {
  const [folderId, setFolderId] = useState(proj.folders[0]?.id ?? null);
  const [selected, setSelected] = useState(null);
  const stats = useMemo(() => projectStats(proj), [proj]);
  const pairs = useMemo(() => beforeAfterPairs(proj), [proj]);
  const missing = useMemo(() => missingShots(proj), [proj]);

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

  const shareSummary = async () => {
    const lines = [
      proj.name,
      `${TEMPLATES[proj.template]?.label ?? 'Custom'} · ${stats.photoCount} photos`,
      '',
      ...proj.folders.map((f) => `${f.label}: ${photosInFolder(proj, f.id).length}`),
    ];
    // Only counts and folder names — never the address, customer or image data.
    try { await Share.share({ message: lines.join('\n') }); } catch (e) { /* user cancelled */ }
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
            {stats.photoCount} photos · {pairs.length} before/after
          </Text>
        </View>
        <TouchableOpacity onPress={shareSummary} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="share-outline" size={20} color={C.textSec} />
        </TouchableOpacity>
      </View>

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

      <TouchableOpacity onPress={onDelete} style={{ padding: 14, alignItems: 'center', marginTop: 12 }}>
        <Text style={{ color: C.danger, fontSize: 13, fontWeight: '600' }}>Delete Project</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
