module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: { '@': './src' },
          extensions: [
            '.ios.tsx',
            '.android.tsx',
            '.native.tsx',
            '.tsx',
            '.ios.ts',
            '.android.ts',
            '.native.ts',
            '.ts',
            '.js',
            '.json',
          ],
        },
      ],
      // react-native-worklets/plugin must be last (Reanimated 4)
      'react-native-worklets/plugin',
    ],
  };
};
