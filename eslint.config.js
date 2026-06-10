import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'

export default defineConfigWithVueTs(
  { ignores: ['dist/**', 'public/lib/**'] },
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    rules: {
      'no-console': 'off',
      'no-debugger': 'off',
      // 3d 相关的几个组件刻意保持纯 JS，允许 <script> 不带 lang
      'vue/block-lang': ['error', { script: { lang: 'ts', allowNoLang: true } }],
      'prefer-const': 'off',
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  // 关掉 oxlint 已覆盖的重叠规则，避免两个 linter 重复报告
  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json')
)
