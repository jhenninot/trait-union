<template>
  <p class="separateur"><span>ou</span></p>
</template>

<style scoped>
.separateur { display: flex; align-items: center; gap: 12px; color: var(--gris); margin: 4px 0; }
.separateur::before, .separateur::after { content: ''; flex: 1; border-top: 1px solid #ddd; }
</style>
