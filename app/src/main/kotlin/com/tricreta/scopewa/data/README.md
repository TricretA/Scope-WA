# data/

Room database package. Deliberately empty past this README until Phase 2
("Contacts: import CSV/VCF/TXT, lists, dedupe, phone normalisation, export" —
see `ARCHITECTURE-V2-WHATSAPP.md` section 9), so the schema is designed once
against real requirements instead of guessed at during Phase 0.

Planned layout, per section 5.3 of the architecture doc:

- `db/entity/` — `ContactEntity`, `ContactListEntity`, `TemplateEntity`,
  `CampaignEntity`, `CampaignMessageEntity`, `GroupAddJobEntity`,
  `ExtractionEntity`, `SettingsEntity`
- `db/dao/` — one DAO per entity above
- `db/ScopeWaDatabase.kt` — the `RoomDatabase` subclass wiring them together
- `repository/` — one repository per feature area, used by the UI and job
  runner layers so neither talks to DAOs directly

`androidx.room` is already on the classpath (see `app/build.gradle.kts`), so
Phase 2 can start writing entities immediately.
