// SPDX-License-Identifier: MPL-2.0
// Renders every component of the kit once. `pnpm --filter @ggraphic/ui demo` serves it;
// the test suite mounts it and runs axe over it.
import { useState, type ReactNode } from 'react';

import {
  Alert,
  AppShell,
  ArrowUpIcon,
  AuthForm,
  AuthLayout,
  Badge,
  Button,
  Card,
  CardBody,
  CardMedia,
  CardText,
  CardTitle,
  Checkbox,
  Divider,
  EyeIcon,
  FeatureGrid,
  Footer,
  Hero,
  IconButton,
  PasswordField,
  PillList,
  ProgressSteps,
  PromptField,
  Section,
  Select,
  SideRail,
  SideRailItem,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextField,
  TopNav,
  Wordmark,
} from '../src/index.js';

const DOTS =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='%23222'/><circle cx='20' cy='20' r='2' fill='%23888'/></svg>";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: '1rem', padding: '2rem var(--ui-gutter)' }}>
      <h2 className="ui-title" style={{ fontSize: '1.75rem' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const row = { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' } as const;
const FOOTER_LINKS = [
  { label: 'Impressum', href: '#impressum' },
  { label: 'Datenschutz', href: '#datenschutz' },
  { label: 'Kontakt', href: '#kontakt' },
];

export function Gallery() {
  const [mode, setMode] = useState('signup');
  return (
    <div className="ui-root">
      <Hero
        imageSrc={DOTS}
        nav={
          <TopNav
            variant="overlay"
            label="Startseite"
            brand={<Wordmark href="#top" />}
            actions={
              <a className="ui-nav__link" href="#signin">
                Anmelden
              </a>
            }
          />
        }
        title="Erzähl deine Geschichte."
        description="Die europäische Design-Plattform für Aktivist*innen und Vereine – mit KI, in deiner Marke."
        actions={
          <>
            <Button size="lg">Kostenlos starten</Button>
            <Button size="lg" variant="inverse">
              Vorlagen ansehen
            </Button>
          </>
        }
      />

      <TopNav
        label="Hauptnavigation"
        brand={<Wordmark dot />}
        links={[
          { label: 'Vorlagen', href: '#vorlagen', current: true },
          { label: 'KI', href: '#ki' },
          { label: 'Datenschutz', href: '#eu' },
        ]}
        actions={<Button size="sm">Kostenlos starten</Button>}
      />

      <Block title="Buttons">
        <div style={row}>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div style={row}>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button asChild variant="outline">
            <a href="#link">Link as button</a>
          </Button>
          <IconButton label="Passwort anzeigen" icon={<EyeIcon />} />
          <IconButton label="Absenden" variant="solid" icon={<ArrowUpIcon />} />
          <IconButton label="Vorschau" variant="outline" icon={<EyeIcon />} />
        </div>
      </Block>

      <Block title="Fields">
        <div style={{ display: 'grid', gap: '1.125rem', maxWidth: '26rem' }}>
          <TextField
            label="E-Mail"
            type="email"
            placeholder="du@verein.de"
            hint="Wir schicken dir einen Link."
          />
          <TextField
            label="Verein oder Initiative"
            error="Bitte gib einen Namen ein."
            defaultValue=""
          />
          <PasswordField
            label="Passwort"
            placeholder="Mindestens 10 Zeichen"
            labelAction={
              <a className="ui-link" href="#forgot">
                Vergessen?
              </a>
            }
          />
          <Select
            label="Format"
            placeholder="Format wählen"
            options={[
              { value: 'poster', label: 'Plakat 4:5' },
              { value: 'story', label: 'Story 9:16' },
              { value: 'flyer', label: 'Flyer A5' },
            ]}
          />
          <Checkbox label="Ich akzeptiere die Nutzungsbedingungen" />
          <Checkbox label="Newsletter" error="Bitte bestätige." />
          <PromptField
            label="Nachricht an die KI"
            placeholder="Was ist passiert?"
            submitLabel="Gestalten"
          />
          <PromptField
            variant="outlined"
            label="Beschreibung"
            placeholder="Nachricht an die KI …"
            submitLabel="Senden"
          />
        </div>
      </Block>

      <Block title="Badges, notices, tabs, steps">
        <div style={row}>
          <Badge>4:5</Badge>
          <Badge tone="accent">Neu</Badge>
          <Badge tone="wine">Wein</Badge>
          <Badge tone="highlight">Rosé</Badge>
          <Badge tone="outline">Outline</Badge>
          <Badge tone="dashed">Gestrichelt</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="success">Gespeichert</Badge>
          <Badge tone="warning">Achtung</Badge>
          <Badge tone="danger">Fehler</Badge>
        </div>
        <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '36rem' }}>
          <Alert title="Hinweis">Dein Entwurf wird automatisch gespeichert.</Alert>
          <Alert tone="success" title="Schau in dein Postfach.">
            Der Link ist 15 Minuten gültig.
          </Alert>
          <Alert tone="warning" title="Logo zu klein">
            Für den Druck empfehlen wir mindestens 1000 px.
          </Alert>
          <Alert tone="danger" title="Das hat nicht geklappt">
            Bitte versuche es noch einmal.
          </Alert>
        </div>
        <Tabs value={mode} onValueChange={setMode} style={{ maxWidth: '26rem' }}>
          <TabsList aria-label="Anmeldeart">
            <TabsTrigger value="login">Anmelden</TabsTrigger>
            <TabsTrigger value="signup">Registrieren</TabsTrigger>
          </TabsList>
          <TabsContent value="login">Anmelden-Formular</TabsContent>
          <TabsContent value="signup">Registrieren-Formular</TabsContent>
        </Tabs>
        <ProgressSteps
          total={3}
          current={1}
          label="Brandkit, Schritt 2 von 3"
          style={{ maxWidth: '26rem' }}
        />
        <Divider>oder</Divider>
      </Block>

      <Section
        tone="subtle"
        title="Haltung, Plakat, Zahl des Monats."
        accent="Vorlagen für jede Geschichte."
      >
        <ul
          style={{
            display: 'grid',
            gap: '1.5rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            margin: 0,
            padding: 0,
            listStyle: 'none',
          }}
        >
          {['Haltung in Worten', 'Schrift als Bild', 'Zahl des Monats'].map((t) => (
            <li key={t}>
              <Card asChild>
                <a href="#template">
                  <CardMedia />
                  <CardBody>
                    <CardTitle badge={<Badge shape="square">4:5</Badge>}>{t}</CardTitle>
                    <CardText>Muster: Textaussage auf Fläche</CardText>
                  </CardBody>
                </a>
              </Card>
            </li>
          ))}
        </ul>
        <Card variant="outlined" padded>
          <CardBody>
            <CardTitle>Outlined card</CardTitle>
            <CardText>Plain text content in a padded card.</CardText>
          </CardBody>
        </Card>
      </Section>

      <Section title="Warum ggraphic">
        <FeatureGrid
          features={[
            {
              id: 'brand',
              title: 'Einmal Marke, immer Marke.',
              description: 'Logo, Farben, Schriften hinterlegen.',
            },
            { id: 'ai', title: 'KI, die zuhört.', description: 'Schreib, was passiert ist.' },
            { id: 'eu', title: 'Gehostet in Europa.', description: 'DSGVO-konform.' },
          ]}
        />
      </Section>

      <Section
        tone="subtle"
        title="Für alle, die etwas bewegen."
        accent="Gemacht und gehostet in Europa."
      >
        <PillList>
          <Badge size="lg" tone="outline">
            Vereine
          </Badge>
          <Badge size="lg" tone="accent">
            Initiativen
          </Badge>
          <Badge size="lg" tone="wine">
            Bürgerbewegungen
          </Badge>
          <Badge size="lg" tone="highlight">
            Sportvereine
          </Badge>
          <Badge size="lg" tone="dashed">
            Gewerkschaften
          </Badge>
        </PillList>
      </Section>

      <Block title="App shell">
        <div
          style={{
            border: '1px solid var(--ui-color-border)',
            borderRadius: 'var(--ui-radius-lg)',
            overflow: 'hidden',
          }}
        >
          <AppShell
            mainElement="div"
            style={{ minHeight: '22rem' }}
            top={
              <TopNav
                variant="solid"
                brand={<Wordmark size="sm" />}
                actions={<Button size="sm">Neu</Button>}
                label="App"
              />
            }
            rail={
              <SideRail>
                <SideRailItem icon={<ArrowUpIcon />} label="Start" href="#home" current />
                <SideRailItem icon={<EyeIcon />} label="Marke" href="#brand" />
              </SideRail>
            }
          >
            <h3 className="ui-title" style={{ fontSize: '1.75rem' }}>
              Was gestaltest du heute?
            </h3>
          </AppShell>
        </div>
      </Block>

      <Section tone="inverse" title="Und deine Geschichte?" tight>
        <PromptField
          label="Was ist passiert?"
          placeholder="Was ist passiert?"
          submitLabel="Gestalten"
        />
      </Section>
      <Footer
        tone="inverse"
        brand={<Wordmark size="sm" />}
        note="Kostenlos starten · ohne Kreditkarte · in Europa gehostet"
        links={FOOTER_LINKS}
      />

      <div style={{ minHeight: '40rem' }}>
        <AuthLayout
          brand={<Wordmark href="#top" />}
          heading="Schön, dass du da bist."
          imageSrc={DOTS}
        >
          <AuthForm>
            <Tabs defaultValue="signup" style={{ display: 'grid', gap: '1.75rem' }}>
              <TabsList aria-label="Anmeldeart">
                <TabsTrigger value="login">Anmelden</TabsTrigger>
                <TabsTrigger value="signup">Registrieren</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <form style={{ display: 'grid', gap: '1.125rem' }}>
                  <TextField label="E-Mail" type="email" autoComplete="email" />
                  <PasswordField label="Passwort" />
                  <Button type="submit" size="lg" fullWidth>
                    Anmelden
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form style={{ display: 'grid', gap: '1.125rem' }}>
                  <TextField label="E-Mail" type="email" autoComplete="email" />
                  <PasswordField label="Passwort" autoComplete="new-password" />
                  <Button type="submit" size="lg" fullWidth>
                    Kostenlos registrieren
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            <Divider>oder</Divider>
            <Button variant="outline" size="lg" fullWidth>
              Link per E-Mail schicken
            </Button>
          </AuthForm>
        </AuthLayout>
      </div>
    </div>
  );
}
