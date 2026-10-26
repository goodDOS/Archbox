<template>
  <aside class="sidebar">
    <NavToolbar />

    <button
      class="nav-item"
      :class="{ active: store.page === 'home' }"
      @click="goto('home')"
      :title="t('shell.navHome')"
    >
      <Icon name="home" :size="16" />
      <span>{{ t('shell.navHome') }}</span>
    </button>
    <button
      class="nav-item"
      :class="{ active: store.page === 'search' }"
      @click="goto('search')"
      :title="t('shell.navSearch')"
    >
      <Icon name="search" :size="16" />
      <span>{{ t('shell.navSearch') }}</span>
    </button>
    <button
      class="nav-item"
      :class="{ active: store.page === 'taxonomy' }"
      @click="goto('taxonomy')"
      :title="t('shell.navTaxonomy')"
    >
      <Icon name="layers" :size="16" />
      <span>{{ t('shell.navTaxonomy') }}</span>
    </button>
    <button
      class="nav-item"
      :class="{ active: store.page === 'posts' }"
      @click="goto('posts')"
      :title="t('shell.navPosts')"
    >
      <Icon name="stack" :size="16" />
      <span>{{ t('shell.navPosts') }}</span>
    </button>
    <button
      class="nav-item"
      :class="{ active: store.page === 'lanshare' }"
      @click="goto('lanshare')"
      :title="t('shell.navLanShare')"
    >
      <Icon name="lan-share" :size="16" />
      <span>{{ t('shell.navLanShare') }}</span>
    </button>

    <RegionNav />

    <div style="margin-top: auto"></div>
    <button
      class="nav-item"
      :class="{ active: store.page === 'trash' }"
      @click="goto('trash')"
      :title="t('shell.navTrash')"
    >
      <Icon name="trash" :size="16" />
      <span>{{ t('shell.navTrash') }}</span>
    </button>
    <button
      class="nav-item"
      :class="{ active: store.page === 'settings' }"
      @click="goto('settings')"
      :title="t('shell.navSettings')"
    >
      <Icon name="settings" :size="16" />
      <span>{{ t('shell.navSettings') }}</span>
    </button>
    <button
      class="nav-item"
      :class="{ active: store.page === 'about' }"
      @click="goto('about')"
      :title="t('shell.navAbout')"
    >
      <Icon name="info" :size="16" />
      <span>{{ t('shell.navAbout') }}</span>
    </button>

    <div
      class="sb-user"
      @click="switchUser"
      :title="t('shell.switchUser', { name: store.user.name, id: store.user.id })"
    >
      <span class="avatar">{{ (store.user.name || '?').slice(0, 1) }}</span>
      <div class="info">
        <b>{{ store.user.name }}</b>
        <i>{{ store.user.id }}</i>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { store, goto, logout } from '../store';
import { t } from '../i18n';
import Icon from './Icon.vue';
import NavToolbar from './NavToolbar.vue';
import RegionNav from './RegionNav.vue';

function switchUser() {
  logout();
}
</script>

<style scoped></style>
