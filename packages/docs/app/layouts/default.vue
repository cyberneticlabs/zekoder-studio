<template>
  <div class="flex min-h-screen flex-col bg-bg text-fg">
    <DocsHeader />
    <UMain class="flex-1">
      <slot />
    </UMain>
    <DocsFooter />
  </div>
</template>
