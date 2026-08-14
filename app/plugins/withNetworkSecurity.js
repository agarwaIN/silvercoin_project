const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withNetworkSecurity = (config) => {
  // 1. Ensure network_security_config.xml is written into android/app/src/main/res/xml/
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resXmlDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      if (!fs.existsSync(resXmlDir)) {
        fs.mkdirSync(resXmlDir, { recursive: true });
      }
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">13.200.237.51</domain>
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
    </domain-config>
</network-security-config>`;
      fs.writeFileSync(path.join(resXmlDir, 'network_security_config.xml'), xmlContent, 'utf8');
      return cfg;
    },
  ]);

  // 2. Attach android:networkSecurityConfig="@xml/network_security_config" to <application> in AndroidManifest.xml
  config = withAndroidManifest(config, (cfg) => {
    const mainApplication = cfg.modResults.manifest.application?.[0];
    if (mainApplication) {
      mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';
      mainApplication.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });

  return config;
};

module.exports = withNetworkSecurity;
