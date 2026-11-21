# Audit rozhraní Pracovního deníku

Výchozí verze: `27f2165`. Inventář obsahuje **484 položek**: obrazovky, komponenty, generické cesty, formuláře a nalezené dialogy. Počet položek není počtem samostatných uživatelských obrazovek. Aktivní iOS cíl používá NativeAPI; staré hybridní zdroje se nesestavují.

Podle upřesnění uživatele chráníme **pouze společně přepracované nativní iOS obrazovky**. Mobilní a desktopový web lze měnit podle jejich vzoru. Kontrola `scripts/check-protected-surfaces.mjs` porovnává 39 souborů a 7 sdílených fragmentů s původním zdrojem.

Role: vlastník, administrátor, správce, pracovník, čtenář; Super Admin má samostatné centrální API, přihlášení a TOTP. Tenant správce nezískává přístup k centrální administraci.

Stav v tabulce popisuje výchozí audit. Skutečně provedené změny, rozsah ověření a zbývající rozdíly jsou uvedeny v realizačním reportu. Automatické vyhledání dialogu samo o sobě není vizuální kontrolou.

| Platforma | Pohled / formulář / dialog | Druh | Výchozí stav | Zdroj |
| --- | --- | --- | --- | --- |
| ios | APIActionEditor | view | Částečně přepracována – audit výchozího stavu | [APIActions.swift](../../apps/iphone/NativeAPI/APIActions.swift#L15) |
| ios | APIJobStatusEditor | view | Částečně přepracována – audit výchozího stavu | [APIActions.swift](../../apps/iphone/NativeAPI/APIActions.swift#L34) |
| ios | APIDepartureEditor | view | Částečně přepracována – audit výchozího stavu | [APIActions.swift](../../apps/iphone/NativeAPI/APIActions.swift#L69) |
| ios | APIOutboxView | view | Částečně přepracována – audit výchozího stavu | [APIAdministration.swift](../../apps/iphone/NativeAPI/APIAdministration.swift#L5) |
| ios | APIRecordLinksView | view | Částečně přepracována – audit výchozího stavu | [APIAdministration.swift](../../apps/iphone/NativeAPI/APIAdministration.swift#L17) |
| ios | APIDriveSettings | view | Částečně přepracována – audit výchozího stavu | [APIAdministration.swift](../../apps/iphone/NativeAPI/APIAdministration.swift#L63) |
| ios | APIProtocolEmailView | view | Částečně přepracována – audit výchozího stavu | [APIAdministration.swift](../../apps/iphone/NativeAPI/APIAdministration.swift#L82) |
| ios | APIDraftDestination | view | Částečně přepracována – audit výchozího stavu | [APIAdministration.swift](../../apps/iphone/NativeAPI/APIAdministration.swift#L103) |
| ios | APIAttendanceAction | view | Již přepracována – iOS neměnit | [APIAttendance.swift](../../apps/iphone/NativeAPI/APIAttendance.swift#L42) |
| ios | APIAttendanceLiveCard | component | Již přepracována – iOS neměnit | [APIAttendanceComponents.swift](../../apps/iphone/NativeAPI/APIAttendanceComponents.swift#L4) |
| ios | APIAttendanceMetrics | component | Již přepracována – iOS neměnit | [APIAttendanceComponents.swift](../../apps/iphone/NativeAPI/APIAttendanceComponents.swift#L55) |
| ios | APIAttendanceDayRow | component | Již přepracována – iOS neměnit | [APIAttendanceComponents.swift](../../apps/iphone/NativeAPI/APIAttendanceComponents.swift#L60) |
| ios | APIAttendancePersonRow | component | Již přepracována – iOS neměnit | [APIAttendanceComponents.swift](../../apps/iphone/NativeAPI/APIAttendanceComponents.swift#L71) |
| ios | APIAttendanceChart | view | Již přepracována – iOS neměnit | [APIAttendanceComponents.swift](../../apps/iphone/NativeAPI/APIAttendanceComponents.swift#L76) |
| ios | APIAttendanceMonthPicker | view | Již přepracována – iOS neměnit | [APIAttendanceComponents.swift](../../apps/iphone/NativeAPI/APIAttendanceComponents.swift#L102) |
| ios | APIAttendanceDayView | view | Již přepracována – iOS neměnit | [APIAttendanceDayView.swift](../../apps/iphone/NativeAPI/APIAttendanceDayView.swift#L4) |
| ios | APIAttendanceRepairView | view | Již přepracována – iOS neměnit | [APIAttendanceDayView.swift](../../apps/iphone/NativeAPI/APIAttendanceDayView.swift#L70) |
| ios | APIAttendanceCorrectionRow | component | Již přepracována – iOS neměnit | [APIAttendanceDayView.swift](../../apps/iphone/NativeAPI/APIAttendanceDayView.swift#L76) |
| ios | APIAttendanceJobDaySummary | component | Již přepracována – iOS neměnit | [APIAttendanceDayView.swift](../../apps/iphone/NativeAPI/APIAttendanceDayView.swift#L89) |
| ios | APIAttendancePreviewHost | view | Již přepracována – iOS neměnit | [APIAttendancePreviews.swift](../../apps/iphone/NativeAPI/APIAttendancePreviews.swift#L3) |
| ios | APIAttendanceView | view | Již přepracována – iOS neměnit | [APIAttendanceScreen.swift](../../apps/iphone/NativeAPI/APIAttendanceScreen.swift#L4) |
| ios | APIBackupsView | view | Částečně přepracována – audit výchozího stavu | [APIBackups.swift](../../apps/iphone/NativeAPI/APIBackups.swift#L14) |
| ios | APISubscriptionContent | view | Částečně přepracována – audit výchozího stavu | [APIBusinessModules.swift](../../apps/iphone/NativeAPI/APIBusinessModules.swift#L3) |
| ios | APISubscriptionActivation | view | Částečně přepracována – audit výchozího stavu | [APIBusinessModules.swift](../../apps/iphone/NativeAPI/APIBusinessModules.swift#L32) |
| ios | APIVehiclesHome | view | Částečně přepracována – audit výchozího stavu | [APIBusinessModules.swift](../../apps/iphone/NativeAPI/APIBusinessModules.swift#L54) |
| ios | APIDefectBadge | component | Částečně přepracována – audit výchozího stavu | [APIBusinessModules.swift](../../apps/iphone/NativeAPI/APIBusinessModules.swift#L71) |
| ios | APIHistoryVisit | view | Částečně přepracována – audit výchozího stavu | [APIBusinessModules.swift](../../apps/iphone/NativeAPI/APIBusinessModules.swift#L75) |
| ios | APINoticeContent | view | Částečně přepracována – audit výchozího stavu | [APIBusinessModules.swift](../../apps/iphone/NativeAPI/APIBusinessModules.swift#L90) |
| ios | DiaryBadge | component | Částečně přepracována – audit výchozího stavu | [APIComponents.swift](../../apps/iphone/NativeAPI/APIComponents.swift#L3) |
| ios | DiaryTile | component | Částečně přepracována – audit výchozího stavu | [APIComponents.swift](../../apps/iphone/NativeAPI/APIComponents.swift#L11) |
| ios | NativeJobCard | component | Částečně přepracována – audit výchozího stavu | [APIComponents.swift](../../apps/iphone/NativeAPI/APIComponents.swift#L23) |
| ios | APIConflictReview | view | Částečně přepracována – audit výchozího stavu | [APIConflictReview.swift](../../apps/iphone/NativeAPI/APIConflictReview.swift#L3) |
| ios | APIOverview | view | Již přepracována – iOS neměnit | [APIDashboard.swift](../../apps/iphone/NativeAPI/APIDashboard.swift#L3) |
| ios | APIDashboardFreshness | view | Již přepracována – iOS neměnit | [APIDashboardComponents.swift](../../apps/iphone/NativeAPI/APIDashboardComponents.swift#L8) |
| ios | APIDashboardStat | view | Již přepracována – iOS neměnit | [APIDashboardComponents.swift](../../apps/iphone/NativeAPI/APIDashboardComponents.swift#L22) |
| ios | APIDashboardStats | view | Již přepracována – iOS neměnit | [APIDashboardComponents.swift](../../apps/iphone/NativeAPI/APIDashboardComponents.swift#L31) |
| ios | APIDashboardPersonRow | component | Již přepracována – iOS neměnit | [APIDashboardComponents.swift](../../apps/iphone/NativeAPI/APIDashboardComponents.swift#L56) |
| ios | APIDashboardProjectRow | component | Již přepracována – iOS neměnit | [APIDashboardComponents.swift](../../apps/iphone/NativeAPI/APIDashboardComponents.swift#L70) |
| ios | APIDashboardVisitRow | component | Již přepracována – iOS neměnit | [APIDashboardComponents.swift](../../apps/iphone/NativeAPI/APIDashboardComponents.swift#L82) |
| ios | APIDashboardPreviewHost | view | Již přepracována – iOS neměnit | [APIDashboardPreviews.swift](../../apps/iphone/NativeAPI/APIDashboardPreviews.swift#L5) |
| ios | APIDashboardCurrentJob | view | Již přepracována – iOS neměnit | [APIDashboardWork.swift](../../apps/iphone/NativeAPI/APIDashboardWork.swift#L3) |
| ios | APIDashboardAttendanceCard | component | Již přepracována – iOS neměnit | [APIDashboardWork.swift](../../apps/iphone/NativeAPI/APIDashboardWork.swift#L47) |
| ios | APIFieldsView | view | Již přepracována – iOS neměnit | [APIForms.swift](../../apps/iphone/NativeAPI/APIForms.swift#L3) |
| ios | APIFieldEditor | view | Již přepracována – iOS neměnit | [APIForms.swift](../../apps/iphone/NativeAPI/APIForms.swift#L17) |
| ios | APIEntityEditor | view | Částečně přepracována – audit výchozího stavu | [APIForms.swift](../../apps/iphone/NativeAPI/APIForms.swift#L78) |
| ios | APIJobsMap | view | Částečně přepracována – audit výchozího stavu | [APIGeometry.swift](../../apps/iphone/NativeAPI/APIGeometry.swift#L26) |
| ios | APIZonesView | view | Částečně přepracována – audit výchozího stavu | [APIGeometry.swift](../../apps/iphone/NativeAPI/APIGeometry.swift#L56) |
| ios | APIShaftEditor | view | Částečně přepracována – audit výchozího stavu | [APIGeometry.swift](../../apps/iphone/NativeAPI/APIGeometry.swift#L64) |
| ios | APIPlanView | view | Částečně přepracována – audit výchozího stavu | [APIGeometry.swift](../../apps/iphone/NativeAPI/APIGeometry.swift#L101) |
| ios | APIBlowoutView | view | Částečně přepracována – audit výchozího stavu | [APIGeometry.swift](../../apps/iphone/NativeAPI/APIGeometry.swift#L139) |
| ios | APIJobActionBar | view | Již přepracována – iOS neměnit | [APIJobActionBar.swift](../../apps/iphone/NativeAPI/APIJobActionBar.swift#L3) |
| ios | APIJobCompletionSummary | component | Již přepracována – iOS neměnit | [APIJobCompletion.swift](../../apps/iphone/NativeAPI/APIJobCompletion.swift#L18) |
| ios | APIJobCompletionCard | component | Již přepracována – iOS neměnit | [APIJobCompletion.swift](../../apps/iphone/NativeAPI/APIJobCompletion.swift#L33) |
| ios | APIJobCompletionCompactContent | view | Již přepracována – iOS neměnit | [APIJobCompletion.swift](../../apps/iphone/NativeAPI/APIJobCompletion.swift#L46) |
| ios | APIJobCompletionEditor | view | Již přepracována – iOS neměnit | [APIJobCompletion.swift](../../apps/iphone/NativeAPI/APIJobCompletion.swift#L84) |
| ios | APIJobStatusBadge | component | Již přepracována – iOS neměnit | [APIJobDetailComponents.swift](../../apps/iphone/NativeAPI/APIJobDetailComponents.swift#L3) |
| ios | APIJobAvatarStack | component | Již přepracována – iOS neměnit | [APIJobDetailComponents.swift](../../apps/iphone/NativeAPI/APIJobDetailComponents.swift#L9) |
| ios | APIJobCompactHeader | component | Již přepracována – iOS neměnit | [APIJobDetailComponents.swift](../../apps/iphone/NativeAPI/APIJobDetailComponents.swift#L21) |
| ios | APIJobTimeOverview | view | Již přepracována – iOS neměnit | [APIJobDetailComponents.swift](../../apps/iphone/NativeAPI/APIJobDetailComponents.swift#L45) |
| ios | APIJobMetric | view | Již přepracována – iOS neměnit | [APIJobDetailComponents.swift](../../apps/iphone/NativeAPI/APIJobDetailComponents.swift#L86) |
| ios | APIJobWorkerRow | component | Již přepracována – iOS neměnit | [APIJobDetailComponents.swift](../../apps/iphone/NativeAPI/APIJobDetailComponents.swift#L97) |
| ios | APIJobDetailContent | view | Již přepracována – iOS neměnit | [APIJobDetailContent.swift](../../apps/iphone/NativeAPI/APIJobDetailContent.swift#L4) |
| ios | APIJobSettingsRow | component | Již přepracována – iOS neměnit | [APIJobDetailContent.swift](../../apps/iphone/NativeAPI/APIJobDetailContent.swift#L171) |
| ios | APIJobQuickLabel | component | Již přepracována – iOS neměnit | [APIJobDetailContent.swift](../../apps/iphone/NativeAPI/APIJobDetailContent.swift#L185) |
| ios | APIJobSupplementary | view | Již přepracována – iOS neměnit | [APIJobDetailContent.swift](../../apps/iphone/NativeAPI/APIJobDetailContent.swift#L190) |
| ios | APIJobRecordManagement | view | Již přepracována – iOS neměnit | [APIJobDetailContent.swift](../../apps/iphone/NativeAPI/APIJobDetailContent.swift#L202) |
| ios | APIJobDetailPreviewHost | view | Již přepracována – iOS neměnit | [APIJobDetailPreviews.swift](../../apps/iphone/NativeAPI/APIJobDetailPreviews.swift#L7) |
| ios | APIJobDiary | view | Částečně přepracována – audit výchozího stavu | [APIJobDiary.swift](../../apps/iphone/NativeAPI/APIJobDiary.swift#L10) |
| ios | APIJobDiaryEditor | view | Částečně přepracována – audit výchozího stavu | [APIJobDiary.swift](../../apps/iphone/NativeAPI/APIJobDiary.swift#L69) |
| ios | APIJobListRow | component | Již přepracována – iOS neměnit | [APIJobListRow.swift](../../apps/iphone/NativeAPI/APIJobListRow.swift#L3) |
| ios | APIJobRowWorkSheet | component | Již přepracována – iOS neměnit | [APIJobListRow.swift](../../apps/iphone/NativeAPI/APIJobListRow.swift#L129) |
| ios | APIUpcomingVisits | view | Již přepracována – iOS neměnit | [APIJobListRow.swift](../../apps/iphone/NativeAPI/APIJobListRow.swift#L163) |
| ios | APIJobTimeView | view | Již přepracována – iOS neměnit | [APIJobTime.swift](../../apps/iphone/NativeAPI/APIJobTime.swift#L81) |
| ios | APIWorkTimeConflictView | view | Již přepracována – iOS neměnit | [APIJobTime.swift](../../apps/iphone/NativeAPI/APIJobTime.swift#L199) |
| ios | APIWorkTimeActionEditor | view | Již přepracována – iOS neměnit | [APIJobTime.swift](../../apps/iphone/NativeAPI/APIJobTime.swift#L244) |
| ios | APIWorkTimeProposalEditor | view | Již přepracována – iOS neměnit | [APIJobTime.swift](../../apps/iphone/NativeAPI/APIJobTime.swift#L290) |
| ios | APIWorkTimeAdministration | view | Již přepracována – iOS neměnit | [APIJobTime.swift](../../apps/iphone/NativeAPI/APIJobTime.swift#L298) |
| ios | APIJobsFilterSheet | view | Již přepracována – iOS neměnit | [APIJobsFilters.swift](../../apps/iphone/NativeAPI/APIJobsFilters.swift#L3) |
| ios | APIJobsCalendarSheet | view | Již přepracována – iOS neměnit | [APIJobsFilters.swift](../../apps/iphone/NativeAPI/APIJobsFilters.swift#L60) |
| ios | APIJobsPreviewHost | view | Již přepracována – iOS neměnit | [APIJobsPreviews.swift](../../apps/iphone/NativeAPI/APIJobsPreviews.swift#L4) |
| ios | APIJobsScreen | view | Již přepracována – iOS neměnit | [APIJobsScreen.swift](../../apps/iphone/NativeAPI/APIJobsScreen.swift#L3) |
| ios | APIMaterialReview | view | Částečně přepracována – audit výchozího stavu | [APIMaterialReview.swift](../../apps/iphone/NativeAPI/APIMaterialReview.swift#L22) |
| ios | APIMaterialPreferredEditor | view | Částečně přepracována – audit výchozího stavu | [APIMaterialReview.swift](../../apps/iphone/NativeAPI/APIMaterialReview.swift#L38) |
| ios | APIAuthenticatedImage | view | Částečně přepracována – audit výchozího stavu | [APIMedia.swift](../../apps/iphone/NativeAPI/APIMedia.swift#L18) |
| ios | APIQuickLook | view | Částečně přepracována – audit výchozího stavu | [APIMedia.swift](../../apps/iphone/NativeAPI/APIMedia.swift#L43) |
| ios | APICamera | view | Částečně přepracována – audit výchozího stavu | [APIMedia.swift](../../apps/iphone/NativeAPI/APIMedia.swift#L50) |
| ios | APIFilesView | view | Částečně přepracována – audit výchozího stavu | [APIMedia.swift](../../apps/iphone/NativeAPI/APIMedia.swift#L82) |
| ios | APISignature | view | Částečně přepracována – audit výchozího stavu | [APIMedia.swift](../../apps/iphone/NativeAPI/APIMedia.swift#L170) |
| ios | APIPhotoGrid | view | Částečně přepracována – audit výchozího stavu | [APIPhotoGrid.swift](../../apps/iphone/NativeAPI/APIPhotoGrid.swift#L3) |
| ios | APIProtocolEditor | view | Již přepracována – iOS neměnit | [APIProtocol.swift](../../apps/iphone/NativeAPI/APIProtocol.swift#L4) |
| ios | APIProtocolCatalog | view | Již přepracována – iOS neměnit | [APIProtocolCatalog.swift](../../apps/iphone/NativeAPI/APIProtocolCatalog.swift#L3) |
| ios | APIProtocolMaterialTotals | view | Již přepracována – iOS neměnit | [APIProtocolCatalog.swift](../../apps/iphone/NativeAPI/APIProtocolCatalog.swift#L38) |
| ios | APIProtocolMaterialLine | view | Již přepracována – iOS neměnit | [APIProtocolCatalog.swift](../../apps/iphone/NativeAPI/APIProtocolCatalog.swift#L42) |
| ios | APIProtocolSectionLabel | component | Již přepracována – iOS neměnit | [APIProtocolComponents.swift](../../apps/iphone/NativeAPI/APIProtocolComponents.swift#L4) |
| ios | APIProtocolWorkSection | view | Již přepracována – iOS neměnit | [APIProtocolComponents.swift](../../apps/iphone/NativeAPI/APIProtocolComponents.swift#L8) |
| ios | APIProtocolTimeSection | view | Již přepracována – iOS neměnit | [APIProtocolComponents.swift](../../apps/iphone/NativeAPI/APIProtocolComponents.swift#L20) |
| ios | APIProtocolPhotos | view | Již přepracována – iOS neměnit | [APIProtocolComponents.swift](../../apps/iphone/NativeAPI/APIProtocolComponents.swift#L24) |
| ios | APIProtocolReview | view | Již přepracována – iOS neměnit | [APIProtocolComponents.swift](../../apps/iphone/NativeAPI/APIProtocolComponents.swift#L38) |
| ios | APIProtocolShare | view | Již přepracována – iOS neměnit | [APIProtocolComponents.swift](../../apps/iphone/NativeAPI/APIProtocolComponents.swift#L51) |
| ios | APIWorkChargesEditor | view | Již přepracována – iOS neměnit | [APIProtocolPDF.swift](../../apps/iphone/NativeAPI/APIProtocolPDF.swift#L5) |
| ios | APIProtocolPreviewHost | view | Již přepracována – iOS neměnit | [APIProtocolPreviews.swift](../../apps/iphone/NativeAPI/APIProtocolPreviews.swift#L3) |
| ios | APIProtocolSignatureScreen | view | Již přepracována – iOS neměnit | [APIProtocolSignature.swift](../../apps/iphone/NativeAPI/APIProtocolSignature.swift#L3) |
| ios | APIProtocolTemplateManager | view | Již přepracována – iOS neměnit | [APIProtocolTemplates.swift](../../apps/iphone/NativeAPI/APIProtocolTemplates.swift#L4) |
| ios | APIProtocolTemplateEditor | view | Již přepracována – iOS neměnit | [APIProtocolTemplates.swift](../../apps/iphone/NativeAPI/APIProtocolTemplates.swift#L12) |
| ios | APIResourceList | view | Již přepracována – iOS neměnit | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L3) |
| ios | APIRecordRow | component | Již přepracována – iOS neměnit | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L64) |
| ios | APIEntityDetail | view | Částečně přepracována – audit výchozího stavu | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L96) |
| ios | APIReadFields | view | Částečně přepracována – audit výchozího stavu | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L319) |
| ios | APIDataPairs | view | Částečně přepracována – audit výchozího stavu | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L334) |
| ios | APIRolePreviewPicker | view | Částečně přepracována – audit výchozího stavu | [APIRolePreview.swift](../../apps/iphone/NativeAPI/APIRolePreview.swift#L7) |
| ios | APIRolePreviewBanner | view | Částečně přepracována – audit výchozího stavu | [APIRolePreview.swift](../../apps/iphone/NativeAPI/APIRolePreview.swift#L15) |
| ios | APIRoot | view | Již přepracována – iOS neměnit | [APIRoot.swift](../../apps/iphone/NativeAPI/APIRoot.swift#L4) |
| ios | APILogin | view | Částečně přepracována – audit výchozího stavu | [APIRoot.swift](../../apps/iphone/NativeAPI/APIRoot.swift#L57) |
| ios | APIHeader | component | Již přepracována – iOS neměnit | [APIRoot.swift](../../apps/iphone/NativeAPI/APIRoot.swift#L77) |
| ios | APIMore | view | Částečně přepracována – audit výchozího stavu | [APIRoot.swift](../../apps/iphone/NativeAPI/APIRoot.swift#L85) |
| ios | APISessionsView | view | Částečně přepracována – audit výchozího stavu | [APISecurity.swift](../../apps/iphone/NativeAPI/APISecurity.swift#L3) |
| ios | APIPrivacyView | view | Částečně přepracována – audit výchozího stavu | [APISecurity.swift](../../apps/iphone/NativeAPI/APISecurity.swift#L13) |
| ios | APIProtocolPhotoPicker | view | Částečně přepracována – audit výchozího stavu | [APISecurity.swift](../../apps/iphone/NativeAPI/APISecurity.swift#L21) |
| ios | APISettings | view | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L3) |
| ios | APIConfigView | view | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L45) |
| ios | APIPasswordView | view | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L55) |
| ios | APITeamContent | view | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L67) |
| ios | APILocalAccountEditor | view | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L80) |
| ios | APIHealthView | view | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L92) |
| ios | APIShaftCanvas | view | Částečně přepracována – audit výchozího stavu | [APIShaftCanvas.swift](../../apps/iphone/NativeAPI/APIShaftCanvas.swift#L4) |
| ios | APIShaftContent | view | Částečně přepracována – audit výchozího stavu | [APIShaftCanvas.swift](../../apps/iphone/NativeAPI/APIShaftCanvas.swift#L26) |
| ios | APIPlanCanvas | view | Částečně přepracována – audit výchozího stavu | [APIShaftCanvas.swift](../../apps/iphone/NativeAPI/APIShaftCanvas.swift#L34) |
| ios | APISubscriptionPlanEditor | view | Částečně přepracována – audit výchozího stavu | [APISubscriptionPlan.swift](../../apps/iphone/NativeAPI/APISubscriptionPlan.swift#L4) |
| mobile-web / desktop-web | access-ui | module | Částečně přepracována – audit výchozího stavu | [access-ui.js](../../apps/work-diary/web/access-ui.js) |
| mobile-web / desktop-web | attendance-ui | module | Částečně přepracována – audit výchozího stavu | [attendance-ui.js](../../apps/work-diary/web/attendance-ui.js) |
| mobile-web / desktop-web | blowout-ui | module | Částečně přepracována – audit výchozího stavu | [blowout-ui.js](../../apps/work-diary/web/blowout-ui.js) |
| mobile-web / desktop-web | customers-ui | module | Částečně přepracována – audit výchozího stavu | [customers-ui.js](../../apps/work-diary/web/customers-ui.js) |
| mobile-web / desktop-web | device-permissions-ui | module | Částečně přepracována – audit výchozího stavu | [device-permissions-ui.js](../../apps/work-diary/web/device-permissions-ui.js) |
| mobile-web / desktop-web | drive-ui | module | Částečně přepracována – audit výchozího stavu | [drive-ui.js](../../apps/work-diary/web/drive-ui.js) |
| mobile-web / desktop-web | email-settings-ui | module | Částečně přepracována – audit výchozího stavu | [email-settings-ui.js](../../apps/work-diary/web/email-settings-ui.js) |
| mobile-web / desktop-web | garden-history-ui | module | Částečně přepracována – audit výchozího stavu | [garden-history-ui.js](../../apps/work-diary/web/garden-history-ui.js) |
| mobile-web / desktop-web | garden-ui | module | Částečně přepracována – audit výchozího stavu | [garden-ui.js](../../apps/work-diary/web/garden-ui.js) |
| mobile-web / desktop-web | invoice-settings-ui | module | Částečně přepracována – audit výchozího stavu | [invoice-settings-ui.js](../../apps/work-diary/web/invoice-settings-ui.js) |
| mobile-web / desktop-web | job-backlog-ui | module | Částečně přepracována – audit výchozího stavu | [job-backlog-ui.js](../../apps/work-diary/web/job-backlog-ui.js) |
| mobile-web / desktop-web | job-completion-ui | module | Částečně přepracována – audit výchozího stavu | [job-completion-ui.js](../../apps/work-diary/web/job-completion-ui.js) |
| mobile-web / desktop-web | job-diary-ui | module | Částečně přepracována – audit výchozího stavu | [job-diary-ui.js](../../apps/work-diary/web/job-diary-ui.js) |
| mobile-web / desktop-web | job-handoffs-ui | module | Částečně přepracována – audit výchozího stavu | [job-handoffs-ui.js](../../apps/work-diary/web/job-handoffs-ui.js) |
| mobile-web / desktop-web | job-map-ui | module | Částečně přepracována – audit výchozího stavu | [job-map-ui.js](../../apps/work-diary/web/job-map-ui.js) |
| mobile-web / desktop-web | job-photos-ui | module | Částečně přepracována – audit výchozího stavu | [job-photos-ui.js](../../apps/work-diary/web/job-photos-ui.js) |
| mobile-web / desktop-web | job-table-ui | module | Částečně přepracována – audit výchozího stavu | [job-table-ui.js](../../apps/work-diary/web/job-table-ui.js) |
| mobile-web / desktop-web | job-time-ui | module | Částečně přepracována – audit výchozího stavu | [job-time-ui.js](../../apps/work-diary/web/job-time-ui.js) |
| mobile-web / desktop-web | job-timeline-ui | module | Částečně přepracována – audit výchozího stavu | [job-timeline-ui.js](../../apps/work-diary/web/job-timeline-ui.js) |
| mobile-web / desktop-web | job-week-ui | module | Částečně přepracována – audit výchozího stavu | [job-week-ui.js](../../apps/work-diary/web/job-week-ui.js) |
| mobile-web / desktop-web | jobs-ui | module | Částečně přepracována – audit výchozího stavu | [jobs-ui.js](../../apps/work-diary/web/jobs-ui.js) |
| mobile-web / desktop-web | local-auth-ui | module | Částečně přepracována – audit výchozího stavu | [local-auth-ui.js](../../apps/work-diary/web/local-auth-ui.js) |
| mobile-web / desktop-web | materials-ui | module | Částečně přepracována – audit výchozího stavu | [materials-ui.js](../../apps/work-diary/web/materials-ui.js) |
| mobile-web / desktop-web | nearby-ui | module | Částečně přepracována – audit výchozího stavu | [nearby-ui.js](../../apps/work-diary/web/nearby-ui.js) |
| mobile-web / desktop-web | notifications-ui | module | Částečně přepracována – audit výchozího stavu | [notifications-ui.js](../../apps/work-diary/web/notifications-ui.js) |
| mobile-web / desktop-web | operations-ui | module | Částečně přepracována – audit výchozího stavu | [operations-ui.js](../../apps/work-diary/web/operations-ui.js) |
| mobile-web / desktop-web | overview-ui | module | Částečně přepracována – audit výchozího stavu | [overview-ui.js](../../apps/work-diary/web/overview-ui.js) |
| mobile-web / desktop-web | plan-ui | module | Částečně přepracována – audit výchozího stavu | [plan-ui.js](../../apps/work-diary/web/plan-ui.js) |
| mobile-web / desktop-web | position-map-ui | module | Částečně přepracována – audit výchozího stavu | [position-map-ui.js](../../apps/work-diary/web/position-map-ui.js) |
| mobile-web / desktop-web | protocol-email-ui | module | Částečně přepracována – audit výchozího stavu | [protocol-email-ui.js](../../apps/work-diary/web/protocol-email-ui.js) |
| mobile-web / desktop-web | record-links-ui | module | Částečně přepracována – audit výchozího stavu | [record-links-ui.js](../../apps/work-diary/web/record-links-ui.js) |
| mobile-web / desktop-web | reminder-settings-ui | module | Částečně přepracována – audit výchozího stavu | [reminder-settings-ui.js](../../apps/work-diary/web/reminder-settings-ui.js) |
| mobile-web / desktop-web | service-work-ui | module | Částečně přepracována – audit výchozího stavu | [service-work-ui.js](../../apps/work-diary/web/service-work-ui.js) |
| mobile-web / desktop-web | settings-ui | module | Částečně přepracována – audit výchozího stavu | [settings-ui.js](../../apps/work-diary/web/settings-ui.js) |
| mobile-web / desktop-web | subscriptions-ui | module | Částečně přepracována – audit výchozího stavu | [subscriptions-ui.js](../../apps/work-diary/web/subscriptions-ui.js) |
| mobile-web / desktop-web | vehicles-ui | module | Částečně přepracována – audit výchozího stavu | [vehicles-ui.js](../../apps/work-diary/web/vehicles-ui.js) |
| mobile-web / desktop-web | volume-test-ui | module | Částečně přepracována – audit výchozího stavu | [volume-test-ui.js](../../apps/work-diary/web/volume-test-ui.js) |
| mobile-web / desktop-web | work-charges-ui | module | Částečně přepracována – audit výchozího stavu | [work-charges-ui.js](../../apps/work-diary/web/work-charges-ui.js) |
| mobile-web / desktop-web | workspace-recovery-ui | module | Částečně přepracována – audit výchozího stavu | [workspace-recovery-ui.js](../../apps/work-diary/web/workspace-recovery-ui.js) |
| mobile-web / desktop-web | workspace-ui | module | Částečně přepracována – audit výchozího stavu | [workspace-ui.js](../../apps/work-diary/web/workspace-ui.js) |
| super-admin-web | admin | module | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js) |
| super-admin-web | overview | module | Částečně přepracována – audit výchozího stavu | [overview.js](../../apps/super-admin/web/overview.js) |
| ios | jobs:list | resource route | Již přepracována – iOS neměnit | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | jobs:detail | resource route | Již přepracována – iOS neměnit | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | jobs:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | customers:list | resource route | Již přepracována – iOS neměnit | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | customers:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | customers:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | gardens:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | gardens:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | gardens:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | defects:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | defects:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | defects:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | materials:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | materials:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | materials:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | categories:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | categories:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | categories:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | vehicles:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | vehicles:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | vehicles:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | entries:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | entries:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | entries:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | drivers:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | drivers:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | tariffs:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | tariffs:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | tariffs:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | subscriptions:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | subscriptions:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | subscriptions:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | services:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | services:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | services:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | history:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | history:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | shafts:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | shafts:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | shafts:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | notifications:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | notifications:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | team:list | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | team:detail | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| ios | team:create/edit | resource route | Částečně přepracována – audit výchozího stavu | [APISchema.swift](../../apps/iphone/NativeAPI/APISchema.swift) |
| mobile-web / desktop-web | home | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | gardenOverview | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | gardenFolders | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | gardenHome | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | editGarden | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | editService | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | selectPositionOnMap | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | manualPosition | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | zonesPage | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | backupSettings | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | editor | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | editValveLabel | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | editZone | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | teamPage | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | presentInvite | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| mobile-web / desktop-web | showLogin | page or dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js) |
| ios | Informovat zákazníka | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIActions.swift](../../apps/iphone/NativeAPI/APIActions.swift#L100) |
| ios | isPresented:$report){APIProtocolEditor(store:store,jobID:job.id,completing:true)} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIActions.swift](../../apps/iphone/NativeAPI/APIActions.swift#L69) |
| ios | Zrušit odesílání? Uložený koncept zůstane zachovaný. | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIAdministration.swift](../../apps/iphone/NativeAPI/APIAdministration.swift#L14) |
| ios | Odpojit aktuální Google Disk? Soubory na Disku zůstanou zachované. | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIAdministration.swift](../../apps/iphone/NativeAPI/APIAdministration.swift#L78) |
| ios | Odeslat protokol na  | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIAdministration.swift](../../apps/iphone/NativeAPI/APIAdministration.swift#L96) |
| ios | item:$file){FileShare(url:$0.url)}} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIAdministration.swift](../../apps/iphone/NativeAPI/APIAdministration.swift#L14) |
| ios | item:$share){APIQuickLook(url:$0.url)}} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIAdministration.swift](../../apps/iphone/NativeAPI/APIAdministration.swift#L96) |
| ios | Porovnat a vyřešit konflikt | navigation | Částečně přepracována – audit výchozího stavu | [APIAdministration.swift](../../apps/iphone/NativeAPI/APIAdministration.swift#L11) |
| ios | Otevřít koncept | navigation | Částečně přepracována – audit výchozího stavu | [APIAdministration.swift](../../apps/iphone/NativeAPI/APIAdministration.swift#L12) |
| ios | Zkontrolovat a navrhnout opravu | navigation | Již přepracována – iOS neměnit | [APIAttendanceComponents.swift](../../apps/iphone/NativeAPI/APIAttendanceComponents.swift#L25) |
| ios | item:$localAction){APIAttendanceAction(store:store,action:$0)} | sheet destination | Již přepracována – iOS neměnit | [APIAttendanceDayView.swift](../../apps/iphone/NativeAPI/APIAttendanceDayView.swift#L59) |
| ios | isPresented:$calendar){APIAttendanceMonthPicker(month:$selectedMonth)} | sheet destination | Již přepracována – iOS neměnit | [APIAttendanceScreen.swift](../../apps/iphone/NativeAPI/APIAttendanceScreen.swift#L67) |
| ios | item:$action){APIAttendanceAction(store:store,action:$0)} | sheet destination | Již přepracována – iOS neměnit | [APIAttendanceScreen.swift](../../apps/iphone/NativeAPI/APIAttendanceScreen.swift#L68) |
| ios | \(store.outbox.count) změn čeká na synchronizaci | navigation | Již přepracována – iOS neměnit | [APIAttendanceScreen.swift](../../apps/iphone/NativeAPI/APIAttendanceScreen.swift#L80) |
| ios | Obnovit do prázdné instalace | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIBackups.swift](../../apps/iphone/NativeAPI/APIBackups.swift#L30) |
| ios | item:$share){FileShare(url:$0.url)}.alert("Obnovit do prázdné instalace",isPresented:$restorePrompt){TextField("Napište OBNOVIT",text:$confi | sheet destination | Částečně přepracována – audit výchozího stavu | [APIBackups.swift](../../apps/iphone/NativeAPI/APIBackups.swift#L30) |
| ios | item:$contract){r in APISubscriptionActivation(store:store,initial:r.value)}.sheet(item:$visit){request in APISubscriptionPlanEditor(store:s | sheet destination | Částečně přepracována – audit výchozího stavu | [APIBusinessModules.swift](../../apps/iphone/NativeAPI/APIBusinessModules.swift#L29) |
| ios | item:$file){item in APIQuickLook(url:item.url).onDisappear{try? FileManager.default.removeItem(at:item.url.deletingLastPathComponent())}}} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIBusinessModules.swift](../../apps/iphone/NativeAPI/APIBusinessModules.swift#L88) |
| ios | Správa vozidel | navigation | Částečně přepracována – audit výchozího stavu | [APIBusinessModules.swift](../../apps/iphone/NativeAPI/APIBusinessModules.swift#L66) |
| ios | Řidiči | navigation | Částečně přepracována – audit výchozího stavu | [APIBusinessModules.swift](../../apps/iphone/NativeAPI/APIBusinessModules.swift#L66) |
| ios | Původní zakázka a protokol | navigation | Částečně přepracována – audit výchozího stavu | [APIBusinessModules.swift](../../apps/iphone/NativeAPI/APIBusinessModules.swift#L86) |
| ios | Otevřít související zakázku | navigation | Částečně přepracována – audit výchozího stavu | [APIBusinessModules.swift](../../apps/iphone/NativeAPI/APIBusinessModules.swift#L94) |
| ios | Nahradit odmítnutý zápis zkontrolovanou změnou? | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIConflictReview.swift](../../apps/iphone/NativeAPI/APIConflictReview.swift#L14) |
| ios | Všichni pracovníci | navigation | Již přepracována – iOS neměnit | [APIDashboard.swift](../../apps/iphone/NativeAPI/APIDashboard.swift#L68) |
| ios | Všechny probíhající zakázky | navigation | Již přepracována – iOS neměnit | [APIDashboard.swift](../../apps/iphone/NativeAPI/APIDashboard.swift#L78) |
| ios | Všechny dnešní návštěvy | navigation | Již přepracována – iOS neměnit | [APIDashboard.swift](../../apps/iphone/NativeAPI/APIDashboard.swift#L118) |
| ios | item:$timeAction){item in APIWorkTimeActionEditor(store:store,job:job,snapshot:snapshot,kind:item.kind,selected:[store.userID])} | sheet destination | Již přepracována – iOS neměnit | [APIDashboardWork.swift](../../apps/iphone/NativeAPI/APIDashboardWork.swift#L96) |
| ios | Rozepsané údaje | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIForms.swift](../../apps/iphone/NativeAPI/APIForms.swift#L122) |
| ios | Nechat rozepsanou šachtu? | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIGeometry.swift](../../apps/iphone/NativeAPI/APIGeometry.swift#L92) |
| ios | Zahodit pouze místní rozpracované umístění značek? | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIGeometry.swift](../../apps/iphone/NativeAPI/APIGeometry.swift#L133) |
| ios | item:$selected){group in NavigationStack{List(group.points){point in VStack(alignment:.leading,spacing:4){APIJobListRow(store:store,job:poin | sheet destination | Částečně přepracována – audit výchozího stavu | [APIGeometry.swift](../../apps/iphone/NativeAPI/APIGeometry.swift#L51) |
| ios | item:$file){APIQuickLook(url:$0.url)}.task{await load(restore:true)}.task(id:store.scope+value["plan"]["version"].string){let expected=store | sheet destination | Částečně přepracována – audit výchozího stavu | [APIGeometry.swift](../../apps/iphone/NativeAPI/APIGeometry.swift#L133) |
| ios | isPresented:$departure){APIDepartureEditor(store:store,job:job)} | sheet destination | Již přepracována – iOS neměnit | [APIJobActionBar.swift](../../apps/iphone/NativeAPI/APIJobActionBar.swift#L31) |
| ios | item:$statusRequest){request in APIJobStatusEditor(store:store,job:job,initialStatus:request.targetStatus)} | sheet destination | Již přepracována – iOS neměnit | [APIJobActionBar.swift](../../apps/iphone/NativeAPI/APIJobActionBar.swift#L32) |
| ios | item:$timeAction){request in APIWorkTimeActionEditor(store:store,job:job,snapshot:snapshot,kind:request.kind,selected:[store.userID])} | sheet destination | Již přepracována – iOS neměnit | [APIJobActionBar.swift](../../apps/iphone/NativeAPI/APIJobActionBar.swift#L33) |
| ios | isPresented:$report){APIProtocolEditor(store:store,jobID:job.id)} | sheet destination | Již přepracována – iOS neměnit | [APIJobActionBar.swift](../../apps/iphone/NativeAPI/APIJobActionBar.swift#L34) |
| ios | isPresented:$editing){APIJobCompletionEditor(store:store,job:current,isTarget:false)} | sheet destination | Již přepracována – iOS neměnit | [APIJobCompletion.swift](../../apps/iphone/NativeAPI/APIJobCompletion.swift#L41) |
| ios | isPresented:$target){APIJobCompletionEditor(store:store,job:current,isTarget:true)} | sheet destination | Již přepracována – iOS neměnit | [APIJobCompletion.swift](../../apps/iphone/NativeAPI/APIJobCompletion.swift#L42) |
| ios | isPresented:$report){APIProtocolEditor(store:store,jobID:job.id)} | sheet destination | Již přepracována – iOS neměnit | [APIJobDetailContent.swift](../../apps/iphone/NativeAPI/APIJobDetailContent.swift#L32) |
| ios | Karta zákazníka | navigation | Již přepracována – iOS neměnit | [APIJobDetailContent.swift](../../apps/iphone/NativeAPI/APIJobDetailContent.swift#L126) |
| ios | Všechny závady zahrady | navigation | Již přepracována – iOS neměnit | [APIJobDetailContent.swift](../../apps/iphone/NativeAPI/APIJobDetailContent.swift#L140) |
| ios | Smazat denní zápis? Fotografie a servisní protokol zůstanou zachované. | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIJobDiary.swift](../../apps/iphone/NativeAPI/APIJobDiary.swift#L57) |
| ios | isPresented:$editorOpen){APIJobDiaryEditor(store:store,job:job,initial:editing ?? .null)} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIJobDiary.swift](../../apps/iphone/NativeAPI/APIJobDiary.swift#L56) |
| ios | item:$statusRequest){request in APIJobStatusEditor(store:store,job:current,initialStatus:request.targetStatus)} | sheet destination | Již přepracována – iOS neměnit | [APIJobListRow.swift](../../apps/iphone/NativeAPI/APIJobListRow.swift#L44) |
| ios | isPresented:$departure){APIDepartureEditor(store:store,job:current)} | sheet destination | Již přepracována – iOS neměnit | [APIJobListRow.swift](../../apps/iphone/NativeAPI/APIJobListRow.swift#L45) |
| ios | item:$work){request in APIJobRowWorkSheet(store:store,job:current,kind:request.kind)} | sheet destination | Již přepracována – iOS neměnit | [APIJobListRow.swift](../../apps/iphone/NativeAPI/APIJobListRow.swift#L46) |
| ios | isPresented:$report){APIProtocolEditor(store:store,jobID:job.id)} | sheet destination | Již přepracována – iOS neměnit | [APIJobListRow.swift](../../apps/iphone/NativeAPI/APIJobListRow.swift#L47) |
| ios | item:$conflict){op in APIWorkTimeConflictView(store:store,job:job,operation:op)} | sheet destination | Již přepracována – iOS neměnit | [APIJobTime.swift](../../apps/iphone/NativeAPI/APIJobTime.swift#L183) |
| ios | item:$action){request in APIWorkTimeActionEditor(store:store,job:job,snapshot:snapshot,kind:request.kind,selected:selection)} | sheet destination | Již přepracována – iOS neměnit | [APIJobTime.swift](../../apps/iphone/NativeAPI/APIJobTime.swift#L184) |
| ios | item:$proposal){request in APIWorkTimeProposalEditor(store:store,job:job,snapshot:snapshot,interval:request.interval)} | sheet destination | Již přepracována – iOS neměnit | [APIJobTime.swift](../../apps/iphone/NativeAPI/APIJobTime.swift#L185) |
| ios | isPresented:$costs){APIWorkTimeAdministration(store:store,job:job,snapshot:snapshot,mode:"rates")} | sheet destination | Již přepracována – iOS neměnit | [APIJobTime.swift](../../apps/iphone/NativeAPI/APIJobTime.swift#L186) |
| ios | isPresented:$lead){APIWorkTimeAdministration(store:store,job:job,snapshot:snapshot,mode:"lead")} | sheet destination | Již přepracována – iOS neměnit | [APIJobTime.swift](../../apps/iphone/NativeAPI/APIJobTime.swift#L187) |
| ios | isPresented:$add){APIWorkTimeAdministration(store:store,job:job,snapshot:snapshot,mode:"assign")} | sheet destination | Již přepracována – iOS neměnit | [APIJobTime.swift](../../apps/iphone/NativeAPI/APIJobTime.swift#L188) |
| ios | isPresented:$filters){APIJobsFilterSheet(store:store,original:applied,rows:model.rows){value in applied=value;if !value.worker.isEmpty{mine= | sheet destination | Již přepracována – iOS neměnit | [APIJobsScreen.swift](../../apps/iphone/NativeAPI/APIJobsScreen.swift#L54) |
| ios | isPresented:$calendar){APIJobsCalendarSheet(filters:applied){from,to in applied.from=from;applied.to=to;applied.dateRange=true;period = .all | sheet destination | Již přepracována – iOS neměnit | [APIJobsScreen.swift](../../apps/iphone/NativeAPI/APIJobsScreen.swift#L55) |
| ios | isPresented:$map){NavigationStack{APIJobsMap(store:store,jobs:visibleJobs)}} | sheet destination | Již přepracována – iOS neměnit | [APIJobsScreen.swift](../../apps/iphone/NativeAPI/APIJobsScreen.swift#L56) |
| ios | Potvrzujete skutečnou duplicitu? | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIMaterialReview.swift](../../apps/iphone/NativeAPI/APIMaterialReview.swift#L51) |
| ios | item:$selection){group in APIMaterialPreferredEditor(store:store,rows:group.rows,categories:categories)} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIMaterialReview.swift](../../apps/iphone/NativeAPI/APIMaterialReview.swift#L34) |
| ios | Otevřít a doplnit variantu | navigation | Částečně přepracována – audit výchozího stavu | [APIMaterialReview.swift](../../apps/iphone/NativeAPI/APIMaterialReview.swift#L48) |
| ios | isPresented:$camera){APICamera{bytes in Task{await upload(bytes,type:"image/jpeg",name:"Fotografie.jpg")}}} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIMedia.swift](../../apps/iphone/NativeAPI/APIMedia.swift#L136) |
| ios | item:$photoAction){APIActionEditor(store:store,action:$0)} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIMedia.swift](../../apps/iphone/NativeAPI/APIMedia.swift#L138) |
| ios | item:$preview) { file in | sheet destination | Částečně přepracována – audit výchozího stavu | [APIPhotoGrid.swift](../../apps/iphone/NativeAPI/APIPhotoGrid.swift#L25) |
| ios | isPresented:$catalog){APIProtocolCatalog(store:store,items:model.materials,categories:model.categories,lines:field("materialItems"))} | sheet destination | Již přepracována – iOS neměnit | [APIProtocol.swift](../../apps/iphone/NativeAPI/APIProtocol.swift#L50) |
| ios | isPresented:$signature){APIProtocolSignatureScreen(customer:protocolJob["customerName"].string,initial:model.report["protocolDetails"]["sign | sheet destination | Již přepracována – iOS neměnit | [APIProtocol.swift](../../apps/iphone/NativeAPI/APIProtocol.swift#L51) |
| ios | isPresented:$templates,onDismiss:{Task{await model.refreshAuxiliary(store:store)}}){APIProtocolTemplateManager(store:store)} | sheet destination | Již přepracována – iOS neměnit | [APIProtocol.swift](../../apps/iphone/NativeAPI/APIProtocol.swift#L52) |
| ios | isPresented:$review){APIProtocolReview(store:store,model:model,completing:completing,edit:{id in review=false;let target=id=="content" ? "wo | sheet destination | Již přepracována – iOS neměnit | [APIProtocol.swift](../../apps/iphone/NativeAPI/APIProtocol.swift#L53) |
| ios | item:$preview){APIQuickLook(url:$0.url)}.sheet(item:$share){APIProtocolShare(url:$0.url)} | sheet destination | Již přepracována – iOS neměnit | [APIProtocol.swift](../../apps/iphone/NativeAPI/APIProtocol.swift#L54) |
| ios | isPresented:$email,onDismiss:{Task{await model.refreshAuxiliary(store:store)}}){NavigationStack{APIProtocolEmailView(store:store,jobID:jobID | sheet destination | Již přepracována – iOS neměnit | [APIProtocol.swift](../../apps/iphone/NativeAPI/APIProtocol.swift#L55) |
| ios | item:$defectRoute){APIEntityEditor(store:store,resource:$0.resource,original:$0.value,isNew:$0.isNew)}.editLease(store) | sheet destination | Již přepracována – iOS neměnit | [APIProtocol.swift](../../apps/iphone/NativeAPI/APIProtocol.swift#L56) |
| ios | Otevřít čekající změny | navigation | Již přepracována – iOS neměnit | [APIProtocol.swift](../../apps/iphone/NativeAPI/APIProtocol.swift#L36) |
| ios | item:$selection){selected in APIProtocolTemplateEditor(initial:selected.value){template in var rows=data["templates"].array;rows.removeAll{$ | sheet destination | Již přepracována – iOS neměnit | [APIProtocolTemplates.swift](../../apps/iphone/NativeAPI/APIProtocolTemplates.swift#L10) |
| ios | Opravná zakázka již existuje. Přesto založit další? | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L133) |
| ios | Opravdu smazat tento záznam? | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L134) |
| ios | item:$statusRequest){request in APIJobStatusEditor(store:store,job:record,initialStatus:request.targetStatus)} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L131) |
| ios | item:$action) { APIActionEditor(store:store,action:$0) } | sheet destination | Částečně přepracována – audit výchozího stavu | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L132) |
| ios | Správa kategorií | navigation | Částečně přepracována – audit výchozího stavu | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L26) |
| ios | Kontrola podobných položek | navigation | Částečně přepracována – audit výchozího stavu | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L26) |
| ios | Správa tarifů | navigation | Částečně přepracována – audit výchozího stavu | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L27) |
| ios | Otevřít zákazníka | navigation | Částečně přepracována – audit výchozího stavu | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L258) |
| ios | Původní zakázka | navigation | Částečně přepracována – audit výchozího stavu | [APIResourceViews.swift](../../apps/iphone/NativeAPI/APIResourceViews.swift#L285) |
| ios | Obnovení hesla | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APIRoot.swift](../../apps/iphone/NativeAPI/APIRoot.swift#L86) |
| ios | item:$store.route){route in | sheet destination | Částečně přepracována – audit výchozího stavu | [APIRoot.swift](../../apps/iphone/NativeAPI/APIRoot.swift#L28) |
| ios | isPresented:$inbox){NavigationStack{APIResourceList(store:store,resource:APIResource(entity:.notifications))}} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIRoot.swift](../../apps/iphone/NativeAPI/APIRoot.swift#L36) |
| ios | item:$followUp,onDismiss:{watch.clearFollowUp()}){request in Group{if request.action=="protocol"{APIProtocolEditor(store:store,jobID:request | sheet destination | Částečně přepracována – audit výchozího stavu | [APIRoot.swift](../../apps/iphone/NativeAPI/APIRoot.swift#L37) |
| ios | isPresented:$outbox){NavigationStack{APIOutboxView(store:store)}} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIRoot.swift](../../apps/iphone/NativeAPI/APIRoot.swift#L38) |
| ios | isPresented:$push.showSettings){NativePushSettings(push:push)} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIRoot.swift](../../apps/iphone/NativeAPI/APIRoot.swift#L39) |
| ios | isPresented:$watch.showSettings){WatchPhoneSettings()} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIRoot.swift](../../apps/iphone/NativeAPI/APIRoot.swift#L40) |
| ios | isPresented:$selecting) { | sheet destination | Částečně přepracována – audit výchozího stavu | [APISecondaryDesign.swift](../../apps/iphone/NativeAPI/APISecondaryDesign.swift#L67) |
| ios | APISecondaryFormSections | component | Nová sdílená komponenta | [APISecondaryDesign.swift](../../apps/iphone/NativeAPI/APISecondaryDesign.swift#L31) |
| ios | APISecondaryField | component | Nová sdílená komponenta | [APISecondaryDesign.swift](../../apps/iphone/NativeAPI/APISecondaryDesign.swift#L46) |
| ios | APISecondaryChoiceSheet | component | Nová sdílená komponenta | [APISecondaryDesign.swift](../../apps/iphone/NativeAPI/APISecondaryDesign.swift#L72) |
| ios | APISecondarySection | component | Nová sdílená komponenta | [APISecondaryDesign.swift](../../apps/iphone/NativeAPI/APISecondaryDesign.swift#L95) |
| ios | APISecondaryReadFields | component | Nová sdílená komponenta | [APISecondaryDesign.swift](../../apps/iphone/NativeAPI/APISecondaryDesign.swift#L107) |
| ios | APIAppAppearance | component | Nová sdílená komponenta | [APISecondaryDesign.swift](../../apps/iphone/NativeAPI/APISecondaryDesign.swift#L136) |
| ios | APISecondaryFormPreview | component | Nová sdílená komponenta | [APISecondaryPreviews.swift](../../apps/iphone/NativeAPI/APISecondaryPreviews.swift#L3) |
| ios | Odhlásit vybrané zařízení? | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APISecurity.swift](../../apps/iphone/NativeAPI/APISecurity.swift#L10) |
| ios | Potvrdit dobu uchování GPS? | modal / confirmation | Částečně přepracována – audit výchozího stavu | [APISecurity.swift](../../apps/iphone/NativeAPI/APISecurity.swift#L19) |
| ios | isPresented:$reset){APILocalAccountEditor(store:store,member:member)}} | sheet destination | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L84) |
| ios | Výběr oznámení | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L15) |
| ios | Moje přihlášení | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L17) |
| ios | Přihlášená zařízení | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L17) |
| ios | Firma a fakturace | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L20) |
| ios | Uchování GPS | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L21) |
| ios | Název firmy | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L21) |
| ios | Sazby práce a cesty | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L21) |
| ios | Připomínky materiálu | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L22) |
| ios | Rezerva mezi návštěvami | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L23) |
| ios | Zóny závlahy | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L24) |
| ios | Google Disk | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L27) |
| ios | Resend – odesílání e-mailů | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L28) |
| ios | Úplné serverové zálohy | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L30) |
| ios | Kontrola vazeb | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L30) |
| ios | Technický stav | navigation | Částečně přepracována – audit výchozího stavu | [APISettings.swift](../../apps/iphone/NativeAPI/APISettings.swift#L30) |
| ios | item:$file){FileShare(url:$0.url)}} | sheet destination | Částečně přepracována – audit výchozího stavu | [APIShaftCanvas.swift](../../apps/iphone/NativeAPI/APIShaftCanvas.swift#L31) |
| mobile-web / desktop-web | garden-delete-form | form | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L140) |
| mobile-web / desktop-web | garden-form | form | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L157) |
| mobile-web / desktop-web | service-form | form | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L188) |
| mobile-web / desktop-web | position-form | form | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L203) |
| mobile-web / desktop-web | valve-label-form | form | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L244) |
| mobile-web / desktop-web | zone-form | form | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L266) |
| mobile-web / desktop-web | invite-form | form | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L414) |
| mobile-web / desktop-web | Přidat šachtu | dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L135) |
| mobile-web / desktop-web | Smazat zahradu | dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L140) |
| mobile-web / desktop-web | Čekající změny | dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L146) |
| mobile-web / desktop-web | Souřadnice šachty | dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L203) |
| mobile-web / desktop-web | Pozvánka je připravená | dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L419) |
| mobile-web / desktop-web | Pozvánka pro kolegu | dialog | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L424) |
| mobile-web / desktop-web | settings | navigation | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L122) |
| mobile-web / desktop-web | home | navigation | Částečně přepracována – audit výchozího stavu | [app.js](../../apps/work-diary/web/app.js#L444) |
| mobile-web / desktop-web | attendance-correction-form | form | Částečně přepracována – audit výchozího stavu | [attendance-ui.js](../../apps/work-diary/web/attendance-ui.js#L57) |
| mobile-web / desktop-web | attendance-delete-form | form | Částečně přepracována – audit výchozího stavu | [attendance-ui.js](../../apps/work-diary/web/attendance-ui.js#L60) |
| mobile-web / desktop-web | attendance-review-form | form | Částečně přepracována – audit výchozího stavu | [attendance-ui.js](../../apps/work-diary/web/attendance-ui.js#L61) |
| mobile-web / desktop-web | Požádat o smazání docházky | dialog | Částečně přepracována – audit výchozího stavu | [attendance-ui.js](../../apps/work-diary/web/attendance-ui.js#L60) |
| mobile-web / desktop-web | blowout-form | form | Částečně přepracována – audit výchozího stavu | [blowout-ui.js](../../apps/work-diary/web/blowout-ui.js#L38) |
| mobile-web / desktop-web | Pokyny k vyfukování | dialog | Částečně přepracována – audit výchozího stavu | [blowout-ui.js](../../apps/work-diary/web/blowout-ui.js#L38) |
| mobile-web / desktop-web | customers-search | form | Částečně přepracována – audit výchozího stavu | [customers-ui.js](../../apps/work-diary/web/customers-ui.js#L19) |
| mobile-web / desktop-web | customer-attach-form | form | Částečně přepracována – audit výchozího stavu | [customers-ui.js](../../apps/work-diary/web/customers-ui.js#L28) |
| mobile-web / desktop-web | garden-customer-form | form | Částečně přepracována – audit výchozího stavu | [customers-ui.js](../../apps/work-diary/web/customers-ui.js#L29) |
| mobile-web / desktop-web | customer-form | form | Částečně přepracována – audit výchozího stavu | [customers-ui.js](../../apps/work-diary/web/customers-ui.js#L34) |
| mobile-web / desktop-web | Zákazník | dialog | Částečně přepracována – audit výchozího stavu | [customers-ui.js](../../apps/work-diary/web/customers-ui.js#L26) |
| mobile-web / desktop-web | Připojit zahradu | dialog | Částečně přepracována – audit výchozího stavu | [customers-ui.js](../../apps/work-diary/web/customers-ui.js#L28) |
| mobile-web / desktop-web | Zákazník zahrady | dialog | Částečně přepracována – audit výchozího stavu | [customers-ui.js](../../apps/work-diary/web/customers-ui.js#L29) |
| mobile-web / desktop-web | drive-config-form | form | Částečně přepracována – audit výchozího stavu | [drive-ui.js](../../apps/work-diary/web/drive-ui.js#L12) |
| mobile-web / desktop-web | email-settings-form | form | Částečně přepracována – audit výchozího stavu | [email-settings-ui.js](../../apps/work-diary/web/email-settings-ui.js#L7) |
| mobile-web / desktop-web | d | dialog factory | Částečně přepracována – audit výchozího stavu | [garden-history-ui.js](../../apps/work-diary/web/garden-history-ui.js#L12) |
| mobile-web / desktop-web | formulář bez pevného ID · garden-history-ui.js:47 | form | Částečně přepracována – audit výchozího stavu | [garden-history-ui.js](../../apps/work-diary/web/garden-history-ui.js#L47) |
| mobile-web / desktop-web | invoice-company-form | form | Částečně přepracována – audit výchozího stavu | [invoice-settings-ui.js](../../apps/work-diary/web/invoice-settings-ui.js#L6) |
| mobile-web / desktop-web | planning-reserve-form | form | Částečně přepracována – audit výchozího stavu | [job-backlog-ui.js](../../apps/work-diary/web/job-backlog-ui.js#L5) |
| mobile-web / desktop-web | formulář bez pevného ID · job-completion-ui.js:9 | form | Částečně přepracována – audit výchozího stavu | [job-completion-ui.js](../../apps/work-diary/web/job-completion-ui.js#L9) |
| mobile-web / desktop-web | formulář bez pevného ID · job-completion-ui.js:9 | form | Částečně přepracována – audit výchozího stavu | [job-completion-ui.js](../../apps/work-diary/web/job-completion-ui.js#L9) |
| mobile-web / desktop-web | formulář bez pevného ID · job-diary-ui.js:43 | form | Částečně přepracována – audit výchozího stavu | [job-diary-ui.js](../../apps/work-diary/web/job-diary-ui.js#L43) |
| mobile-web / desktop-web | handoff-form | form | Částečně přepracována – audit výchozího stavu | [job-handoffs-ui.js](../../apps/work-diary/web/job-handoffs-ui.js#L4) |
| mobile-web / desktop-web | Předání zakázky | dialog | Částečně přepracována – audit výchozího stavu | [job-handoffs-ui.js](../../apps/work-diary/web/job-handoffs-ui.js#L4) |
| mobile-web / desktop-web | viewer | dialog factory | Částečně přepracována – audit výchozího stavu | [job-photos-ui.js](../../apps/work-diary/web/job-photos-ui.js#L54) |
| mobile-web / desktop-web | planner-confirm-form | form | Částečně přepracována – audit výchozího stavu | [job-planner-actions.js](../../apps/work-diary/web/job-planner-actions.js#L11) |
| mobile-web / desktop-web | planner-single-form | form | Částečně přepracována – audit výchozího stavu | [job-planner-actions.js](../../apps/work-diary/web/job-planner-actions.js#L17) |
| mobile-web / desktop-web | planner-bulk-form | form | Částečně přepracována – audit výchozího stavu | [job-planner-actions.js](../../apps/work-diary/web/job-planner-actions.js#L21) |
| mobile-web / desktop-web | Potvrdit změnu plánu | dialog | Částečně přepracována – audit výchozího stavu | [job-planner-actions.js](../../apps/work-diary/web/job-planner-actions.js#L11) |
| mobile-web / desktop-web | Naplánovat zakázku | dialog | Částečně přepracována – audit výchozího stavu | [job-planner-actions.js](../../apps/work-diary/web/job-planner-actions.js#L17) |
| mobile-web / desktop-web | Hromadně upravit plán | dialog | Částečně přepracována – audit výchozího stavu | [job-planner-actions.js](../../apps/work-diary/web/job-planner-actions.js#L21) |
| mobile-web / desktop-web | job-side-form | form | Částečně přepracována – audit výchozího stavu | [job-side-editor.js](../../apps/work-diary/web/job-side-editor.js#L7) |
| mobile-web / desktop-web | formulář bez pevného ID · job-time-ui.js:12 | form | Částečně přepracována – audit výchozího stavu | [job-time-ui.js](../../apps/work-diary/web/job-time-ui.js#L12) |
| mobile-web / desktop-web | formulář bez pevného ID · job-time-ui.js:13 | form | Částečně přepracována – audit výchozího stavu | [job-time-ui.js](../../apps/work-diary/web/job-time-ui.js#L13) |
| mobile-web / desktop-web | formulář bez pevného ID · job-time-ui.js:19 | form | Částečně přepracována – audit výchozího stavu | [job-time-ui.js](../../apps/work-diary/web/job-time-ui.js#L19) |
| mobile-web / desktop-web | formulář bez pevného ID · job-time-ui.js:23 | form | Částečně přepracována – audit výchozího stavu | [job-time-ui.js](../../apps/work-diary/web/job-time-ui.js#L23) |
| mobile-web / desktop-web | formulář bez pevného ID · job-time-ui.js:23 | form | Částečně přepracována – audit výchozího stavu | [job-time-ui.js](../../apps/work-diary/web/job-time-ui.js#L23) |
| mobile-web / desktop-web | jobs-filters | form | Částečně přepracována – audit výchozího stavu | [jobs-ui.js](../../apps/work-diary/web/jobs-ui.js#L79) |
| mobile-web / desktop-web | job-status-form | form | Částečně přepracována – audit výchozího stavu | [jobs-ui.js](../../apps/work-diary/web/jobs-ui.js#L146) |
| mobile-web / desktop-web | job-departure-form | form | Částečně přepracována – audit výchozího stavu | [jobs-ui.js](../../apps/work-diary/web/jobs-ui.js#L161) |
| mobile-web / desktop-web | job-edit-form | form | Částečně přepracována – audit výchozího stavu | [jobs-ui.js](../../apps/work-diary/web/jobs-ui.js#L264) |
| mobile-web / desktop-web | Jsem na cestě | dialog | Částečně přepracována – audit výchozího stavu | [jobs-ui.js](../../apps/work-diary/web/jobs-ui.js#L161) |
| mobile-web / desktop-web | Odjezd byl zaznamenán | dialog | Částečně přepracována – audit výchozího stavu | [jobs-ui.js](../../apps/work-diary/web/jobs-ui.js#L171) |
| mobile-web / desktop-web | Detail zakázky | dialog | Částečně přepracována – audit výchozího stavu | [jobs-ui.js](../../apps/work-diary/web/jobs-ui.js#L201) |
| mobile-web / desktop-web | Moje přihlášení | dialog | Částečně přepracována – audit výchozího stavu | [local-auth-ui.js](../../apps/work-diary/web/local-auth-ui.js#L38) |
| mobile-web / desktop-web | Způsob přihlašování firmy | dialog | Částečně přepracována – audit výchozího stavu | [local-auth-ui.js](../../apps/work-diary/web/local-auth-ui.js#L43) |
| mobile-web / desktop-web | formulář bez pevného ID · local-auth-ui.js:9 | form | Částečně přepracována – audit výchozího stavu | [local-auth-ui.js](../../apps/work-diary/web/local-auth-ui.js#L9) |
| mobile-web / desktop-web | formulář bez pevného ID · local-auth-ui.js:15 | form | Částečně přepracována – audit výchozího stavu | [local-auth-ui.js](../../apps/work-diary/web/local-auth-ui.js#L15) |
| mobile-web / desktop-web | formulář bez pevného ID · local-auth-ui.js:33 | form | Částečně přepracována – audit výchozího stavu | [local-auth-ui.js](../../apps/work-diary/web/local-auth-ui.js#L33) |
| mobile-web / desktop-web | formulář bez pevného ID · local-auth-ui.js:38 | form | Částečně přepracována – audit výchozího stavu | [local-auth-ui.js](../../apps/work-diary/web/local-auth-ui.js#L38) |
| mobile-web / desktop-web | formulář bez pevného ID · local-auth-ui.js:43 | form | Částečně přepracována – audit výchozího stavu | [local-auth-ui.js](../../apps/work-diary/web/local-auth-ui.js#L43) |
| mobile-web / desktop-web | chooser | dialog factory | Částečně přepracována – audit výchozího stavu | [material-picker.js](../../apps/work-diary/web/material-picker.js#L27) |
| mobile-web / desktop-web | material-delete-form | form | Částečně přepracována – audit výchozího stavu | [materials-ui.js](../../apps/work-diary/web/materials-ui.js#L26) |
| mobile-web / desktop-web | material-edit-form | form | Částečně přepracována – audit výchozího stavu | [materials-ui.js](../../apps/work-diary/web/materials-ui.js#L36) |
| mobile-web / desktop-web | Smazat materiál | dialog | Částečně přepracována – audit výchozího stavu | [materials-ui.js](../../apps/work-diary/web/materials-ui.js#L26) |
| mobile-web / desktop-web | Poloha adresy | dialog | Částečně přepracována – audit výchozího stavu | [nearby-ui.js](../../apps/work-diary/web/nearby-ui.js#L23) |
| mobile-web / desktop-web | panel | dialog factory | Částečně přepracována – audit výchozího stavu | [notifications-ui.js](../../apps/work-diary/web/notifications-ui.js#L3) |
| mobile-web / desktop-web | formulář bez pevného ID · notifications-ui.js:29 | form | Částečně přepracována – audit výchozího stavu | [notifications-ui.js](../../apps/work-diary/web/notifications-ui.js#L29) |
| mobile-web / desktop-web | formulář bez pevného ID · operations-ui.js:10 | form | Částečně přepracována – audit výchozího stavu | [operations-ui.js](../../apps/work-diary/web/operations-ui.js#L10) |
| mobile-web / desktop-web | formulář bez pevného ID · operations-ui.js:10 | form | Částečně přepracována – audit výchozího stavu | [operations-ui.js](../../apps/work-diary/web/operations-ui.js#L10) |
| mobile-web / desktop-web | Šachta v plánu | dialog | Částečně přepracována – audit výchozího stavu | [plan-ui.js](../../apps/work-diary/web/plan-ui.js#L24) |
| mobile-web / desktop-web | Vyberte šachtu | dialog | Částečně přepracována – audit výchozího stavu | [plan-ui.js](../../apps/work-diary/web/plan-ui.js#L31) |
| mobile-web / desktop-web | Umístit šachtu na mapu | dialog | Částečně přepracována – audit výchozího stavu | [position-map-ui.js](../../apps/work-diary/web/position-map-ui.js#L4) |
| mobile-web / desktop-web | dialog | dialog factory | Částečně přepracována – audit výchozího stavu | [protocol-form-ui.js](../../apps/work-diary/web/protocol-form-ui.js#L56) |
| mobile-web / desktop-web | protocol-template-form | form | Částečně přepracována – audit výchozího stavu | [protocol-templates-ui.js](../../apps/work-diary/web/protocol-templates-ui.js#L23) |
| mobile-web / desktop-web | Šablony protokolů | dialog | Částečně přepracována – audit výchozího stavu | [protocol-templates-ui.js](../../apps/work-diary/web/protocol-templates-ui.js#L15) |
| mobile-web / desktop-web | Upravit šablonu | dialog | Částečně přepracována – audit výchozího stavu | [protocol-templates-ui.js](../../apps/work-diary/web/protocol-templates-ui.js#L23) |
| mobile-web / desktop-web | Kontrola propojení | dialog | Částečně přepracována – audit výchozího stavu | [record-links-ui.js](../../apps/work-diary/web/record-links-ui.js#L5) |
| mobile-web / desktop-web | material-reminder-form | form | Částečně přepracována – audit výchozího stavu | [reminder-settings-ui.js](../../apps/work-diary/web/reminder-settings-ui.js#L11) |
| mobile-web / desktop-web | service-work-form | form | Částečně přepracována – audit výchozího stavu | [service-work-ui.js](../../apps/work-diary/web/service-work-ui.js#L34) |
| mobile-web / desktop-web | Čekající servisní zápis | dialog | Částečně přepracována – audit výchozího stavu | [service-work-ui.js](../../apps/work-diary/web/service-work-ui.js#L30) |
| mobile-web / desktop-web | Historie stornované návštěvy | dialog | Částečně přepracována – audit výchozího stavu | [service-work-ui.js](../../apps/work-diary/web/service-work-ui.js#L31) |
| mobile-web / desktop-web | Servisní protokol | dialog | Částečně přepracována – audit výchozího stavu | [service-work-ui.js](../../apps/work-diary/web/service-work-ui.js#L34) |
| mobile-web / desktop-web | Servisní protokol · PDF | dialog | Částečně přepracována – audit výchozího stavu | [service-work-ui.js](../../apps/work-diary/web/service-work-ui.js#L67) |
| mobile-web / desktop-web | chooser | dialog factory | Částečně přepracována – audit výchozího stavu | [service-work-ui.js](../../apps/work-diary/web/service-work-ui.js#L50) |
| mobile-web / desktop-web | root | dialog factory | Částečně přepracována – audit výchozího stavu | [service-work-ui.js](../../apps/work-diary/web/service-work-ui.js#L66) |
| mobile-web / desktop-web | features-form | form | Částečně přepracována – audit výchozího stavu | [settings-ui.js](../../apps/work-diary/web/settings-ui.js#L6) |
| mobile-web / desktop-web | subscription-filters | form | Částečně přepracována – audit výchozího stavu | [subscriptions-ui.js](../../apps/work-diary/web/subscriptions-ui.js#L20) |
| mobile-web / desktop-web | tariff-form | form | Částečně přepracována – audit výchozího stavu | [subscriptions-ui.js](../../apps/work-diary/web/subscriptions-ui.js#L36) |
| mobile-web / desktop-web | subscription-contract | form | Částečně přepracována – audit výchozího stavu | [subscriptions-ui.js](../../apps/work-diary/web/subscriptions-ui.js#L46) |
| mobile-web / desktop-web | Servisní předplatné | dialog | Částečně přepracována – audit výchozího stavu | [subscriptions-ui.js](../../apps/work-diary/web/subscriptions-ui.js#L55) |
| mobile-web / desktop-web | Platba předplatného | dialog | Částečně přepracována – audit výchozího stavu | [subscriptions-ui.js](../../apps/work-diary/web/subscriptions-ui.js#L67) |
| mobile-web / desktop-web | Naplánované návštěvy | dialog | Částečně přepracována – audit výchozího stavu | [subscriptions-ui.js](../../apps/work-diary/web/subscriptions-ui.js#L70) |
| mobile-web / desktop-web | Nová servisní návštěva | dialog | Částečně přepracována – audit výchozího stavu | [subscriptions-ui.js](../../apps/work-diary/web/subscriptions-ui.js#L76) |
| mobile-web / desktop-web | formulář bez pevného ID · subscriptions-ui.js:67 | form | Částečně přepracována – audit výchozího stavu | [subscriptions-ui.js](../../apps/work-diary/web/subscriptions-ui.js#L67) |
| mobile-web / desktop-web | formulář bez pevného ID · subscriptions-ui.js:70 | form | Částečně přepracována – audit výchozího stavu | [subscriptions-ui.js](../../apps/work-diary/web/subscriptions-ui.js#L70) |
| mobile-web / desktop-web | formulář bez pevného ID · subscriptions-ui.js:76 | form | Částečně přepracována – audit výchozího stavu | [subscriptions-ui.js](../../apps/work-diary/web/subscriptions-ui.js#L76) |
| mobile-web / desktop-web | Fotografie ·  | dialog | Částečně přepracována – audit výchozího stavu | [vehicles-ui.js](../../apps/work-diary/web/vehicles-ui.js#L57) |
| mobile-web / desktop-web | Řidiči z firemního týmu | dialog | Částečně přepracována – audit výchozího stavu | [vehicles-ui.js](../../apps/work-diary/web/vehicles-ui.js#L72) |
| mobile-web / desktop-web | Účtenka | dialog | Částečně přepracována – audit výchozího stavu | [vehicles-ui.js](../../apps/work-diary/web/vehicles-ui.js#L76) |
| mobile-web / desktop-web | formulář bez pevného ID · vehicles-ui.js:15 | form | Částečně přepracována – audit výchozího stavu | [vehicles-ui.js](../../apps/work-diary/web/vehicles-ui.js#L15) |
| mobile-web / desktop-web | formulář bez pevného ID · vehicles-ui.js:35 | form | Částečně přepracována – audit výchozího stavu | [vehicles-ui.js](../../apps/work-diary/web/vehicles-ui.js#L35) |
| mobile-web / desktop-web | formulář bez pevného ID · vehicles-ui.js:58 | form | Částečně přepracována – audit výchozího stavu | [vehicles-ui.js](../../apps/work-diary/web/vehicles-ui.js#L58) |
| mobile-web / desktop-web | Obnova neodeslané práce | dialog | Částečně přepracována – audit výchozího stavu | [workspace-recovery-ui.js](../../apps/work-diary/web/workspace-recovery-ui.js#L21) |
| mobile-web / desktop-web | Obsah neodeslaného zápisu | dialog | Částečně přepracována – audit výchozího stavu | [workspace-recovery-ui.js](../../apps/work-diary/web/workspace-recovery-ui.js#L27) |
| mobile-web / desktop-web | workspace-membership-form | form | Částečně přepracována – audit výchozího stavu | [workspace-ui.js](../../apps/work-diary/web/workspace-ui.js#L12) |
| mobile-web / desktop-web | Příslušnost k oborům | dialog | Částečně přepracována – audit výchozího stavu | [workspace-ui.js](../../apps/work-diary/web/workspace-ui.js#L12) |
| super-admin-web | company-filters | form | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L32) |
| super-admin-web | mfa-form | form | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L68) |
| super-admin-web | formulář bez pevného ID · admin.js:53 | form | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L53) |
| super-admin-web | formulář bez pevného ID · admin.js:54 | form | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L54) |
| super-admin-web | formulář bez pevného ID · admin.js:59 | form | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L59) |
| super-admin-web | formulář bez pevného ID · admin.js:66 | form | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L66) |
| super-admin-web | formulář bez pevného ID · admin.js:72 | form | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L72) |
| super-admin-web | dashboard · Přehled | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | companies · Firmy | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | professions · Profese | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | modules · Moduly | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | plans · Tarify | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | operations · Technický stav | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | licenses · Licence | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | rollouts · Zpřístupnění funkcí | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | audit · Audit | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | account · Můj účet | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | active · Aktivní | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | trial · Testovací | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | suspended · Pozastavená | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | awaiting_host · Čeká na hosting | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | connecting · Čeká na ověření | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | ready · Připravená | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | queued · Ve frontě | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | running · Zřizuje se | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | failed · Chyba | navigation / page | Částečně přepracována – audit výchozího stavu | [admin.js](../../apps/super-admin/web/admin.js#L12) |
| super-admin-web | formulář bez pevného ID · overview.js:11 | form | Částečně přepracována – audit výchozího stavu | [overview.js](../../apps/super-admin/web/overview.js#L11) |
