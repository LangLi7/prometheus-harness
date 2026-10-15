-- ===========================================================================
-- 0010 — Zusatzordner: LESEN oder SCHREIBEN
-- ===========================================================================
--
-- ANLASS: Der Betreiber hat das Modell klargestellt. Es gibt **eine Hauptwurzel** —
-- den Arbeitsplatz — und die weiteren Ordner sind ein **Zusatz-Zugriff**, keine
-- zweiten gleichrangigen Wurzeln. So ist es auch in der Vorlage gelöst.
--
-- Migration 9 hat die Ordner gebracht und `ist_primaer` für die Hauptwurzel. Was
-- fehlte, ist die **Art des Zugriffs**: darf der Harness in einem Zusatzordner nur
-- lesen oder auch schreiben? Ohne diese Angabe wäre jeder Zusatzordner stillschweigend
-- ein zweiter Schreibweg — und eine Grenze, die niemand gesetzt hat, ist keine.
--
-- WAS DIESE MIGRATION TUT:
--   1. `zugriff` kommt dazu: `'lesen'` oder `'schreiben'`. **Vorgabe ist `lesen`.**
--      Wer schreiben will, sagt es ausdrücklich — je Ordner, nicht als Paket.
--   2. Die **Hauptwurzel ist immer schreibbar.** Sie ist der Arbeitsplatz; ein
--      Arbeitsplatz ohne Schreiben wäre ein Widerspruch. Die Prüfregel macht daraus
--      eine Bedingung der Datenbank statt einer Annahme im Code.
--
-- WARUM DIE VORGABE `lesen` IST. Ein zusätzlicher Ordner ist zuerst ein **Blick**
-- hinein (Daten, Nachbarmodul, Vorlage). Schreiben ist die größere Erlaubnis und
-- gehört ausdrücklich erteilt — dieselbe Haltung wie bei `workspace-write`: der Modus
-- sagt, daß geschrieben werden **darf**, nicht wo überall.
--
-- WARUM KEIN `GRANT` HIER STEHT. Die Tabelle gibt es seit Migration 9; ihre Rechte
-- wurden dort gesetzt. Eine neue Spalte ändert daran nichts.
--
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Die Art des Zugriffs
-- ---------------------------------------------------------------------------
ALTER TABLE workspace_folders
  ADD COLUMN IF NOT EXISTS zugriff text NOT NULL DEFAULT 'lesen';

-- **Welche Werte gelten.** Als Prüfregel und nicht als freier Text: ein Tippfehler
-- (`'schreiben'` falsch geschrieben) wäre sonst ein Ordner, der still nichts darf.
ALTER TABLE workspace_folders
  DROP CONSTRAINT IF EXISTS workspace_folders_zugriff_gueltig;
ALTER TABLE workspace_folders
  ADD CONSTRAINT workspace_folders_zugriff_gueltig CHECK (zugriff IN ('lesen', 'schreiben'));

-- ---------------------------------------------------------------------------
-- 2. Der Arbeitsplatz ist immer schreibbar
-- ---------------------------------------------------------------------------
-- **Erst die vorhandenen Zeilen, dann die Regel.** Eine bestehende Hauptwurzel könnte
-- noch auf `lesen` stehen (die Vorgabe der neuen Spalte); die Regel unten würde sonst
-- an alten Zeilen scheitern.
UPDATE workspace_folders SET zugriff = 'schreiben' WHERE ist_primaer AND zugriff <> 'schreiben';

ALTER TABLE workspace_folders
  DROP CONSTRAINT IF EXISTS workspace_folders_primaer_schreibbar;
ALTER TABLE workspace_folders
  ADD CONSTRAINT workspace_folders_primaer_schreibbar CHECK (NOT ist_primaer OR zugriff = 'schreiben');

-- ---------------------------------------------------------------------------
-- 3. Selbstprüfung der Migration
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pmh' AND table_name = 'workspace_folders' AND column_name = 'zugriff'
  ) THEN
    RAISE EXCEPTION 'Die Spalte workspace_folders.zugriff fehlt.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'pmh' AND t.relname = 'workspace_folders' AND c.conname = 'workspace_folders_zugriff_gueltig'
  ) THEN
    RAISE EXCEPTION 'Die Prüfregel für die Zugriffsart fehlt.';
  END IF;

  -- **Und die Daten.** Keine Hauptwurzel darf nur lesbar sein.
  IF EXISTS (SELECT 1 FROM workspace_folders WHERE ist_primaer AND zugriff <> 'schreiben') THEN
    RAISE EXCEPTION 'Eine Hauptwurzel ist nicht schreibbar — der Arbeitsplatz wäre gesperrt.';
  END IF;
END $$;
