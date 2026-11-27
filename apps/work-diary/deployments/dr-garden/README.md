# Dr. Garden web sources

The shared web source is `apps/work-diary/web`. For the Dr. Garden variant, copy that directory, overlay the three files from this directory's `web` folder, and omit `volume-test-photo-1.jpg` and `volume-test-photo-2.jpg`. This reproduces the tracked web source layout from Sites version 101 (`955dd9e6ad22116980e6dc5f4c9ef152d57dfb22`).

The live Garden deployment relays API requests to Závlahový deník. The shared Worker and migrations in `apps/work-diary` are synchronized from Závlahový deník version 182 (`63db3207c1b64db33a68525a555c31f57cfa8abc`). Configure the API destination and access on the target host when deploying the Garden variant.
