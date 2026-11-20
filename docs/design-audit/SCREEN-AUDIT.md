# Audit rozhraní Pracovního deníku

Výchozí verze: `27f2165` (ověřená IPA 0.8.5). Inventář obsahuje **231 pohledů, komponent, modulů a generických cest**. Jde o skutečný zdroj aktivního klienta; starý hybridní klient se nesestavuje.

Samostatné role: vlastník, administrátor, správce, pracovník, čtenář; Super Admin má oddělené centrální přihlášení/API/TOTP. Čtenář se nesmí při sjednocení ztratit.

## Ochrana

Chráněné soubory a fragmenty jsou v `protected-baseline.json`. Schválené iOS pohledy, seznam zákazníků, jejich společné editory a webová identita B zůstávají výchozí referencí. Sdílené změny se musí zapnout jen na nechráněných cestách; chráněné světlé stránky se ověřují snímky před/po.

## Inventář

| Platforma | Pohled / cesta | Stav | Zdroj |
| --- | --- | --- | --- |
| ios | APIActionEditor | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIActions.swift` |
| ios | APIJobStatusEditor | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIActions.swift` |
| ios | APIDepartureEditor | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIActions.swift` |
| ios | APIOutboxView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIAdministration.swift` |
| ios | APIRecordLinksView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIAdministration.swift` |
| ios | APIDriveSettings | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIAdministration.swift` |
| ios | APIProtocolEmailView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIAdministration.swift` |
| ios | APIDraftDestination | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIAdministration.swift` |
| ios | APIAttendanceAction | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendance.swift` |
| ios | APIAttendanceLiveCard | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendanceComponents.swift` |
| ios | APIAttendanceMetrics | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendanceComponents.swift` |
| ios | APIAttendanceDayRow | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendanceComponents.swift` |
| ios | APIAttendancePersonRow | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendanceComponents.swift` |
| ios | APIAttendanceChart | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendanceComponents.swift` |
| ios | APIAttendanceMonthPicker | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendanceComponents.swift` |
| ios | APIAttendanceDayView | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendanceDayView.swift` |
| ios | APIAttendanceRepairView | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendanceDayView.swift` |
| ios | APIAttendanceCorrectionRow | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendanceDayView.swift` |
| ios | APIAttendanceJobDaySummary | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendanceDayView.swift` |
| ios | APIAttendancePreviewHost | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendancePreviews.swift` |
| ios | APIAttendanceView | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIAttendanceScreen.swift` |
| ios | APIBackupsView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIBackups.swift` |
| ios | APISubscriptionContent | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIBusinessModules.swift` |
| ios | APISubscriptionActivation | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIBusinessModules.swift` |
| ios | APIVehiclesHome | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIBusinessModules.swift` |
| ios | APIDefectBadge | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIBusinessModules.swift` |
| ios | APIHistoryVisit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIBusinessModules.swift` |
| ios | APINoticeContent | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIBusinessModules.swift` |
| ios | DiaryBadge | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIComponents.swift` |
| ios | DiaryTile | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIComponents.swift` |
| ios | NativeJobCard | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIComponents.swift` |
| ios | APIConflictReview | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIConflictReview.swift` |
| ios | APIOverview | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIDashboard.swift` |
| ios | APIDashboardFreshness | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIDashboardComponents.swift` |
| ios | APIDashboardStat | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIDashboardComponents.swift` |
| ios | APIDashboardStats | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIDashboardComponents.swift` |
| ios | APIDashboardPersonRow | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIDashboardComponents.swift` |
| ios | APIDashboardProjectRow | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIDashboardComponents.swift` |
| ios | APIDashboardVisitRow | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIDashboardComponents.swift` |
| ios | APIDashboardPreviewHost | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIDashboardPreviews.swift` |
| ios | APIDashboardCurrentJob | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIDashboardWork.swift` |
| ios | APIDashboardAttendanceCard | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIDashboardWork.swift` |
| ios | APIFieldsView | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIForms.swift` |
| ios | APIFieldEditor | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIForms.swift` |
| ios | APIEntityEditor | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIForms.swift` |
| ios | APIJobsMap | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIGeometry.swift` |
| ios | APIZonesView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIGeometry.swift` |
| ios | APIShaftEditor | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIGeometry.swift` |
| ios | APIPlanView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIGeometry.swift` |
| ios | APIBlowoutView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIGeometry.swift` |
| ios | APIJobActionBar | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobActionBar.swift` |
| ios | APIJobCompletionSummary | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobCompletion.swift` |
| ios | APIJobCompletionCard | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobCompletion.swift` |
| ios | APIJobCompletionCompactContent | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobCompletion.swift` |
| ios | APIJobCompletionEditor | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobCompletion.swift` |
| ios | APIJobStatusBadge | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobDetailComponents.swift` |
| ios | APIJobAvatarStack | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobDetailComponents.swift` |
| ios | APIJobCompactHeader | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobDetailComponents.swift` |
| ios | APIJobTimeOverview | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobDetailComponents.swift` |
| ios | APIJobMetric | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobDetailComponents.swift` |
| ios | APIJobWorkerRow | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobDetailComponents.swift` |
| ios | APIJobDetailContent | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobDetailContent.swift` |
| ios | APIJobSettingsRow | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobDetailContent.swift` |
| ios | APIJobQuickLabel | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobDetailContent.swift` |
| ios | APIJobSupplementary | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobDetailContent.swift` |
| ios | APIJobRecordManagement | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobDetailContent.swift` |
| ios | APIJobDetailPreviewHost | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobDetailPreviews.swift` |
| ios | APIJobDiary | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIJobDiary.swift` |
| ios | APIJobDiaryEditor | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIJobDiary.swift` |
| ios | APIJobListRow | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIJobListRow.swift` |
| ios | APIJobRowWorkSheet | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIJobListRow.swift` |
| ios | APIUpcomingVisits | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIJobListRow.swift` |
| ios | APIJobTimeView | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobTime.swift` |
| ios | APIWorkTimeConflictView | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobTime.swift` |
| ios | APIWorkTimeActionEditor | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobTime.swift` |
| ios | APIWorkTimeProposalEditor | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobTime.swift` |
| ios | APIWorkTimeAdministration | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobTime.swift` |
| ios | APIJobsFilterSheet | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobsFilters.swift` |
| ios | APIJobsCalendarSheet | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobsFilters.swift` |
| ios | APIJobsPreviewHost | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobsPreviews.swift` |
| ios | APIJobsScreen | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIJobsScreen.swift` |
| ios | APIMaterialReview | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIMaterialReview.swift` |
| ios | APIMaterialPreferredEditor | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIMaterialReview.swift` |
| ios | APIAuthenticatedImage | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIMedia.swift` |
| ios | APIQuickLook | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIMedia.swift` |
| ios | APICamera | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIMedia.swift` |
| ios | APIFilesView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIMedia.swift` |
| ios | APISignature | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIMedia.swift` |
| ios | APIPhotoGrid | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIPhotoGrid.swift` |
| ios | APIProtocolEditor | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocol.swift` |
| ios | APIProtocolCatalog | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolCatalog.swift` |
| ios | APIProtocolMaterialTotals | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolCatalog.swift` |
| ios | APIProtocolMaterialLine | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolCatalog.swift` |
| ios | APIProtocolSectionLabel | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolComponents.swift` |
| ios | APIProtocolWorkSection | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolComponents.swift` |
| ios | APIProtocolTimeSection | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolComponents.swift` |
| ios | APIProtocolPhotos | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolComponents.swift` |
| ios | APIProtocolReview | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolComponents.swift` |
| ios | APIProtocolShare | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolComponents.swift` |
| ios | APIWorkChargesEditor | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolPDF.swift` |
| ios | APIProtocolPreviewHost | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolPreviews.swift` |
| ios | APIProtocolSignatureScreen | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolSignature.swift` |
| ios | APIProtocolTemplateManager | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolTemplates.swift` |
| ios | APIProtocolTemplateEditor | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIProtocolTemplates.swift` |
| ios | APIResourceList | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIResourceViews.swift` |
| ios | APIRecordRow | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIResourceViews.swift` |
| ios | APIEntityDetail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIResourceViews.swift` |
| ios | APIReadFields | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIResourceViews.swift` |
| ios | APIDataPairs | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIResourceViews.swift` |
| ios | APIRolePreviewPicker | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIRolePreview.swift` |
| ios | APIRolePreviewBanner | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIRolePreview.swift` |
| ios | APIRoot | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIRoot.swift` |
| ios | APILogin | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIRoot.swift` |
| ios | APIHeader | Již přepracována — neměnit | `apps/iphone/NativeAPI/APIRoot.swift` |
| ios | APIMore | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIRoot.swift` |
| ios | APISessionsView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISecurity.swift` |
| ios | APIPrivacyView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISecurity.swift` |
| ios | APIProtocolPhotoPicker | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISecurity.swift` |
| ios | APISettings | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISettings.swift` |
| ios | APIConfigView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISettings.swift` |
| ios | APIPasswordView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISettings.swift` |
| ios | APITeamContent | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISettings.swift` |
| ios | APILocalAccountEditor | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISettings.swift` |
| ios | APIHealthView | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISettings.swift` |
| ios | APIShaftCanvas | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIShaftCanvas.swift` |
| ios | APIShaftContent | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIShaftCanvas.swift` |
| ios | APIPlanCanvas | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APIShaftCanvas.swift` |
| ios | APISubscriptionPlanEditor | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISubscriptionPlan.swift` |
| mobile-web / desktop-web | access-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/access-ui.js` |
| mobile-web / desktop-web | attendance-ui | Již přepracována — neměnit | `apps/work-diary/web/attendance-ui.js` |
| mobile-web / desktop-web | blowout-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/blowout-ui.js` |
| mobile-web / desktop-web | customers-ui | Již přepracována — neměnit | `apps/work-diary/web/customers-ui.js` |
| mobile-web / desktop-web | device-permissions-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/device-permissions-ui.js` |
| mobile-web / desktop-web | drive-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/drive-ui.js` |
| mobile-web / desktop-web | email-settings-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/email-settings-ui.js` |
| mobile-web / desktop-web | garden-history-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/garden-history-ui.js` |
| mobile-web / desktop-web | garden-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/garden-ui.js` |
| mobile-web / desktop-web | invoice-settings-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/invoice-settings-ui.js` |
| mobile-web / desktop-web | job-backlog-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/job-backlog-ui.js` |
| mobile-web / desktop-web | job-completion-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/job-completion-ui.js` |
| mobile-web / desktop-web | job-diary-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/job-diary-ui.js` |
| mobile-web / desktop-web | job-handoffs-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/job-handoffs-ui.js` |
| mobile-web / desktop-web | job-map-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/job-map-ui.js` |
| mobile-web / desktop-web | job-photos-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/job-photos-ui.js` |
| mobile-web / desktop-web | job-table-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/job-table-ui.js` |
| mobile-web / desktop-web | job-time-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/job-time-ui.js` |
| mobile-web / desktop-web | job-timeline-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/job-timeline-ui.js` |
| mobile-web / desktop-web | job-week-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/job-week-ui.js` |
| mobile-web / desktop-web | jobs-ui | Již přepracována — neměnit | `apps/work-diary/web/jobs-ui.js` |
| mobile-web / desktop-web | local-auth-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/local-auth-ui.js` |
| mobile-web / desktop-web | materials-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/materials-ui.js` |
| mobile-web / desktop-web | nearby-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/nearby-ui.js` |
| mobile-web / desktop-web | notifications-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/notifications-ui.js` |
| mobile-web / desktop-web | operations-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/operations-ui.js` |
| mobile-web / desktop-web | overview-ui | Již přepracována — neměnit | `apps/work-diary/web/overview-ui.js` |
| mobile-web / desktop-web | plan-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/plan-ui.js` |
| mobile-web / desktop-web | position-map-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/position-map-ui.js` |
| mobile-web / desktop-web | protocol-email-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/protocol-email-ui.js` |
| mobile-web / desktop-web | record-links-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/record-links-ui.js` |
| mobile-web / desktop-web | reminder-settings-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/reminder-settings-ui.js` |
| mobile-web / desktop-web | service-work-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/service-work-ui.js` |
| mobile-web / desktop-web | settings-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/settings-ui.js` |
| mobile-web / desktop-web | subscriptions-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/subscriptions-ui.js` |
| mobile-web / desktop-web | vehicles-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/vehicles-ui.js` |
| mobile-web / desktop-web | volume-test-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/volume-test-ui.js` |
| mobile-web / desktop-web | work-charges-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/work-charges-ui.js` |
| mobile-web / desktop-web | workspace-recovery-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/workspace-recovery-ui.js` |
| mobile-web / desktop-web | workspace-ui | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/workspace-ui.js` |
| super-admin-web | admin | Částečně přepracována — dokončit jen nechráněné části | `apps/super-admin/web/admin.js` |
| super-admin-web | overview | Částečně přepracována — dokončit jen nechráněné části | `apps/super-admin/web/overview.js` |
| ios | jobs:list | Již přepracována — neměnit | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | jobs:detail | Již přepracována — neměnit | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | jobs:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | customers:list | Již přepracována — neměnit | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | customers:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | customers:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | gardens:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | gardens:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | gardens:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | defects:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | defects:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | defects:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | materials:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | materials:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | materials:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | categories:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | categories:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | categories:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | vehicles:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | vehicles:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | vehicles:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | entries:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | entries:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | entries:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | drivers:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | drivers:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | tariffs:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | tariffs:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | tariffs:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | subscriptions:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | subscriptions:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | subscriptions:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | services:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | services:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | services:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | history:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | history:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | shafts:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | shafts:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | shafts:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | notifications:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | notifications:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | team:list | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | team:detail | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| ios | team:create/edit | Částečně přepracována — dokončit jen nechráněné části | `apps/iphone/NativeAPI/APISchema.swift` |
| mobile-web / desktop-web | home | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | gardenOverview | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | gardenFolders | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | gardenHome | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | editGarden | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | editService | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | selectPositionOnMap | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | manualPosition | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | zonesPage | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | backupSettings | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | editor | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | editValveLabel | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | editZone | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | teamPage | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | presentInvite | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |
| mobile-web / desktop-web | showLogin | Částečně přepracována — dokončit jen nechráněné části | `apps/work-diary/web/app.js` |

## Funkční rozdíly a plán

- **appearance**: web — forced light root tokens; no user appearance control; iOS — system light/dark; no explicit per-user appearance selector. Postup: add opt-in theme preference; preserve approved light CSS and native reference components.
- **protocol templates and signed metadata**: web — legacy protocol form; shared API preserves modern stored metadata, template management missing; iOS — modern editor/templates and version-bound signatures. Postup: add template management to settings using the existing /api/protocol-templates API; protect existing protocol form.
- **Super Admin**: web — separate central console, company/license/module/connector/rollout administration and TOTP; iOS — tenant client; central console is not exposed as native tenant permission. Postup: preserve security boundary; verify an equivalent authorized web access path instead of granting tenant roles central access.
