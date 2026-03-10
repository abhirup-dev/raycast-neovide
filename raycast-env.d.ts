/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search-recent-projects` command */
  export type SearchRecentProjects = ExtensionPreferences & {}
  /** Preferences accessible in the `search-workspaces` command */
  export type SearchWorkspaces = ExtensionPreferences & {}
  /** Preferences accessible in the `new-window` command */
  export type NewWindow = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search-recent-projects` command */
  export type SearchRecentProjects = {}
  /** Arguments passed to the `search-workspaces` command */
  export type SearchWorkspaces = {}
  /** Arguments passed to the `new-window` command */
  export type NewWindow = {}
}

