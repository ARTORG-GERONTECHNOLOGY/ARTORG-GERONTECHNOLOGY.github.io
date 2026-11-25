# GER student research proposals

Jekyll website for student research and thesis proposals from the Gerontechnology
and Rehabilitation Group at the ARTORG Center, University of Bern.

## Local setup

- [Windows](docs/setup-windows.md): installed environment, verified build commands,
  preview, and troubleshooting.
- [macOS](docs/setup-macos.md): prerequisites and local build instructions; not yet tested.
- [Linux](docs/setup-linux.md): prerequisites and local build instructions; not yet tested.

[Project guide](docs/project-guide.md): source layout, current features, and known issues.

## Start the admin editor locally

Put the team's existing private `access.json` in `../.local/admin-private/`.
With Docker running, start the editor from the repository root.

```sh
bash scripts/start-admin-docker.sh
```

The launcher reuses your GitHub CLI login or Git HTTPS credential. If needed,
it prompts for a one-time GitHub sign-in. Use an account with write access to
the website repository. Open <http://localhost:4100/admin/> and enter
the team access code. **Sync from GitHub** fetches proposals saved to
`content/staff`. Use **Upload reviewed changes** to save a proposal there.
Use `--preview` for local review without a GitHub login.

See the [admin guide](admin-service/README.md#local-review) for manual setup and
the [publication guide](docs/publication.md) for deploying to GitHub Pages.

## Maintenance

- [Staff editor and operations](admin-service/README.md): proposals, drafts, media,
  private access, secret rotation and publication reports.
- [Publication and recovery](docs/publication.md): checked GitHub Pages publishing,
  activation requirements and rollback.
- [Release handover](docs/release-handover.md): verification evidence, final content
  decisions, dependency maintenance and work still required before launch.

## License

Adapted from [Carte Noire](https://github.com/jacobtomlinson/carte-noire).
Theme code is GPLv3 unless otherwise stated; see [LICENSE](LICENSE) for terms and
content exclusions. Third-party asset licenses still apply.
