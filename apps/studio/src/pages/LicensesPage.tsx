// SPDX-License-Identifier: AGPL-3.0-only
/** The third-party notices of what the Studio bundles: THIRD_PARTY_NOTICES.md, as it ships. */
import { Wordmark } from '@ggraphic/ui';

import notices from '../../../../THIRD_PARTY_NOTICES.md?raw';

export function LicensesPage() {
  return (
    <main className="ui-root studio-notices">
      <Wordmark href="/" size="sm">
        ggraphic Studio
      </Wordmark>
      <h1 className="studio-title">Licences</h1>
      <p>
        <a href="/">Back to the Studio</a>
      </p>
      <pre className="studio-notices__text">{notices}</pre>
    </main>
  );
}
