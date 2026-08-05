// ─── COMMUNITY & JOBS ────────────────────────────────────────────────────────
// Q&A and a jobs board.
//
// HONEST CONSTRAINT: both need a server. A "community" whose posts live in
// AsyncStorage is a notes app that only you can read — shipping that as a social
// feature would be a lie to the user. So this screen renders the real UI against
// the real models and states plainly that posting turns on when the backend
// lands. Nothing here fakes other users, fake counts, or seeded "example" posts.
//
// The moment src/core/backend exists, the list sources swap and the compose
// button enables. No layout changes.

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  ThreadCategory, COMMUNITY_SAFETY_BANNER,
} from '../core/community/index';
import { JobType, ExperienceLevel, MIN_SAMPLE_FOR_PAY_STATS } from '../core/community/index';
import { isEnabled } from '../featureFlags';

const TABS = [
  { id: 'questions', label: 'Questions', icon: 'chatbubbles' },
  { id: 'jobs', label: 'Jobs', icon: 'briefcase' },
];

export default function CommunityScreen({ C, setTab }) {
  const [active, setActive] = useState('questions');
  // Both are gated. `communityEnabled` / `jobsBoardEnabled` default off and stay
  // off until there is a server to talk to.
  const live = isEnabled('communityEnabled') || isEnabled('jobsBoardEnabled');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 44 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.purpleBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="people" size={20} color={C.purple} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Community</Text>
          <Text style={{ fontSize: 12, color: C.textTert }}>Electricians helping electricians</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 7, marginBottom: 16 }}>
        {TABS.map((t) => {
          const on = active === t.id;
          return (
            <TouchableOpacity key={t.id} onPress={() => setActive(t.id)}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 11, borderRadius: 11, minHeight: 44,
                backgroundColor: on ? C.purple : C.surface, borderWidth: 1.5, borderColor: on ? C.purple : C.border,
              }}>
              <Ionicons name={t.icon} size={15} color={on ? '#fff' : C.textSec} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#fff' : C.textSec }}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {active === 'questions' ? <QuestionsTab C={C} live={live} /> : <JobsTab C={C} live={live} />}

      <TouchableOpacity onPress={() => setTab && setTab('home')} style={{ padding: 14, alignItems: 'center', marginTop: 10 }}>
        <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600' }}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Questions ───────────────────────────────────────────────────────────────

function QuestionsTab({ C, live }) {
  const categories = [
    { id: ThreadCategory.CODE, label: 'Code' },
    { id: ThreadCategory.TROUBLESHOOTING, label: 'Troubleshooting' },
    { id: ThreadCategory.TOOLS, label: 'Tools' },
    { id: ThreadCategory.BUSINESS, label: 'Business' },
    { id: ThreadCategory.APPRENTICESHIP, label: 'Apprenticeship' },
    { id: ThreadCategory.CONTROLS, label: 'Controls' },
  ];

  return (
    <>
      {/* Permanent, non-dismissible. This is the one place in the app where a
          confidently wrong upvoted answer can get somebody hurt. */}
      <View style={{ backgroundColor: C.amberBg, borderRadius: 12, padding: 13, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: C.amber }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: C.amber, marginBottom: 5 }}>BEFORE YOU READ ANYTHING HERE</Text>
        <Text style={{ fontSize: 11.5, color: C.text, lineHeight: 17.5 }}>{COMMUNITY_SAFETY_BANNER}</Text>
      </View>

      <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>TOPICS</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
        {categories.map((c) => (
          <View key={c.id}
            style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.textSec }}>{c.label}</Text>
          </View>
        ))}
      </View>

      <NotLiveYet
        C={C}
        live={live}
        title="Questions open when the server does"
        body={
          'Posts have to live somewhere every electrician can see. Until the backend is ' +
          'connected, there is nowhere to put them — so rather than storing your question on ' +
          'your own phone and calling it a community, this stays closed.'
        }
        readyList={[
          'Answer voting, with scores damped by flags so a loud wrong answer cannot ride to the top',
          'Flag threshold that hides content without waiting for a moderator',
          'Thread locking with a recorded reason',
          'Code questions require a region — the answer differs by jurisdiction',
          'Citations shown as unverified unless they match the verified knowledge base',
        ]}
      />
    </>
  );
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

function JobsTab({ C, live }) {
  const types = [
    { id: JobType.FULL_TIME, label: 'Full time' },
    { id: JobType.CONTRACT, label: 'Contract' },
    { id: JobType.DAY_LABOUR, label: 'Day work' },
    { id: JobType.APPRENTICESHIP, label: 'Apprenticeship' },
    { id: JobType.SIDE_JOB, label: 'Side job' },
  ];
  const levels = [ExperienceLevel.HELPER, ExperienceLevel.APPRENTICE, ExperienceLevel.JOURNEYMAN, ExperienceLevel.MASTER];

  return (
    <>
      <View style={{ backgroundColor: C.blueSub, borderRadius: 12, padding: 13, marginBottom: 14 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: C.blue, marginBottom: 5 }}>HOW THIS BOARD WORKS</Text>
        <Text style={{ fontSize: 11.5, color: C.text, lineHeight: 17.5 }}>
          Every post must state a pay rate or range — posts without one waste your time and
          degrade the board for everyone, so they cannot be published. Employers with a
          verified licence rank first.
        </Text>
      </View>

      <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>WORK TYPE</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
        {types.map((t) => (
          <View key={t.id} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.textSec }}>{t.label}</Text>
          </View>
        ))}
      </View>

      <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>LEVEL</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
        {levels.map((l) => (
          <View key={l} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.textSec }}>{l.toLowerCase()}</Text>
          </View>
        ))}
      </View>

      <NotLiveYet
        C={C}
        live={live}
        title="The board opens when the server does"
        body={
          'A jobs board with no shared server is an empty page. Nothing is faked here — no ' +
          'sample listings, no placeholder companies.'
        }
        readyList={[
          'Pay transparency enforced — a post without a rate cannot publish',
          'Expired posts disappear automatically',
          'Verified employers rank above unverified ones',
          `Regional pay stats, suppressed below ${MIN_SAMPLE_FOR_PAY_STATS} posts so no single employer is identifiable`,
        ]}
      />
    </>
  );
}

function NotLiveYet({ C, live, title, body, readyList }) {
  if (live) {
    return (
      <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: C.border }}>
        <Text style={{ fontSize: 13.5, color: C.textSec, lineHeight: 20 }}>
          Connected, but there is nothing posted yet. Be the first.
        </Text>
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: C.border }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 8 }}>{title}</Text>
      <Text style={{ fontSize: 12.5, color: C.textSec, lineHeight: 19, marginBottom: 14 }}>{body}</Text>
      <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.5, marginBottom: 8 }}>
        ALREADY BUILT AND TESTED
      </Text>
      {readyList.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
          <Ionicons name="checkmark-circle" size={15} color={C.success} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, color: C.textSec, lineHeight: 18 }}>{r}</Text>
        </View>
      ))}
    </View>
  );
}
