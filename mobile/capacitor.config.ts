import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dredarklabs.meowsynth',
  appName: 'MeowSynth',
  webDir: 'www',
  backgroundColor: '#060607',
  android: {
    backgroundColor: '#060607',
    // MeowSynth plays back short samples with mouse/touch; keep taps snappy —
    // no artificial WebView input delay.
    allowMixedContent: false
  },
  plugins: {
    SplashScreen: {
      // The whole app is a handful of small local files with no network
      // fetch, so it's ready almost instantly — a long splash would just be
      // dead air. Show it briefly then let the page itself take over.
      launchShowDuration: 250,
      launchAutoHide: true,
      backgroundColor: '#060607',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#060607',
      overlaysWebView: true
    }
  }
};

export default config;
