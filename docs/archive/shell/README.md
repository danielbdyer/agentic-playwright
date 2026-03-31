# Shell optimization notes

This folder contains proposed replacements for `~/.bashrc`, `~/.zshrc`, `~/.zprofile`, `~/.gitconfig`, and system-wide VS Code terminal settings based on the current WSL setup.

## What was wrong

- `~/.bashrc` immediately `exec`'d Zsh, which splits shell initialization across two shells.
- VS Code shell integration was loading the Bash script even though the interactive shell ends up being Zsh.
- `PATH` setup contained an invalid export for VirtualBox.
- `npm set prefix ~/.npm` ran on every shell startup even though it is a one-time configuration command.
- `nvm.sh` loaded eagerly in both shells, adding startup cost.
- Bash completion logic had a duplicated nested condition.
- Your installed `nvm` is `0.37.2`, which emits a Zsh `nomatch` warning for some alias commands.

## Recommended model

- Make Zsh the actual default interactive shell.
- Keep `~/.bashrc` valid and fast for the times you intentionally launch Bash.
- Put login-only environment setup in `~/.zprofile`.
- Put VS Code shell integration in `~/.zshrc`, because that is the shell you want to keep open.
- Load expensive tools like NVM lazily.
- Start one reusable SSH agent instead of juggling per-terminal agents.
- Hook `direnv` only if it is installed.
- Make `pnpm` trigger Linux Node selection before it runs.

## Suggested manual apply steps

1. Back up current files:
   - `cp ~/.bashrc ~/.bashrc.backup.$(date +%Y%m%d-%H%M%S)`
   - `cp ~/.zshrc ~/.zshrc.backup.$(date +%Y%m%d-%H%M%S)`
   - `cp ~/.zprofile ~/.zprofile.backup.$(date +%Y%m%d-%H%M%S) 2>/dev/null || true`
2. Copy in the proposed files:
   - `cp docs/shell/bashrc.proposed ~/.bashrc`
   - `cp docs/shell/zshrc.proposed ~/.zshrc`
   - `cp docs/shell/zprofile.proposed ~/.zprofile`
   - `cp docs/shell/gitconfig.proposed ~/.gitconfig`
3. Fix the WSL `nvm` default alias if it points to an uninstalled version:
   - `source ~/.nvm/nvm.sh`
   - `nvm alias default node`
4. Set the one-time npm prefix if you still want it:
   - `npm config set prefix "$HOME/.npm"`
5. Make Zsh the login shell inside WSL if desired:
   - `chsh -s "$(command -v zsh)"`
6. Restart WSL terminals.
7. If you want auto-loading per-project environment files, install `direnv` and then run `direnv allow` in each trusted repo.

In the current environment, `nvm alias default` resolves to `lts/erbium`, which is not installed. That is why `npm` falls back to the Windows Node wrapper at `/c/Program Files/nodejs/npm` and throws `/usr/bin/env: 'bash\r': No such file or directory`.

The proposed `~/.zshrc` also adds `unsetopt nomatch` because your current `nvm` version (`0.37.2`) uses a glob in `nvm_list_aliases()` that throws `no matches found` under Zsh's default glob settings.

## VS Code profile note

The workspace `/.vscode/settings.json` can point the integrated terminal directly at `wsl.exe zsh -l` on Windows and `zsh -l` on Linux. That removes the Bash-to-Zsh trampoline completely and gives shell integration a straightforward startup path.

For a system-wide setup, use these proposed files:

- `docs/shell/vscode-user-settings.proposed.json` -> `C:\Users\danny\AppData\Roaming\Code\User\settings.json`
- `docs/shell/vscode-remote-settings.proposed.json` -> `~/.vscode-server/data/Machine/settings.json`

Those two settings files make the default terminal profile `zsh -l` for both local Windows VS Code and remote WSL windows, with shell integration explicitly enabled and `TERM_PROGRAM=vscode` injected to keep manual shell-integration sourcing reliable.

## Ergonomics notes

- `~/.zprofile` owns login environment like `PATH`, `PNPM_HOME`, `NVM_DIR`, and Homebrew.
- `~/.zshrc` owns interactive concerns like prompt, shell integration, lazy Node tooling, `direnv`, and SSH agent reuse.
- `~/.gitconfig` sets safer defaults for CRLF handling, conflict views, auto-stash on rebase, and fetch pruning.
- `~/.gitignore_global` keeps common machine-local clutter out of every repo.
- The proposed SSH agent setup starts an agent only when one is not already usable, and stores the environment in `~/.ssh/agent.env`.

## Git polish

- Copy `docs/shell/gitignore_global.proposed` to `~/.gitignore_global`.
- Run `git lfs install` once per machine.
- `gh` is installed and ready; authenticate with `gh auth login` when you want GitHub CLI workflows available.
- The shell setup exports `GH_ACCESSIBLE_PROMPTER=1` and `GH_SPINNER_DISABLED=1` because the richer `gh` prompt path emits unexpected escape sequences in this terminal stack.

If `gh auth login` still misbehaves in an older terminal tab, run:

- `GH_ACCESSIBLE_PROMPTER=1 GH_SPINNER_DISABLED=1 gh auth login --hostname github.com --web --git-protocol https`

## Quick validation

- `bash -n ~/.bashrc`
- `zsh -n ~/.zshrc`
- `time zsh -i -c exit`
- `echo $SHELL`
- `echo $TERM_PROGRAM`

## Optional next desktop tweaks

- Add `starship` if you want a faster prompt than `agnoster`.
- Move custom aliases into `~/.zsh_aliases` and source them explicitly.
- Keep Windows paths out of manual `PATH` exports unless WSL interop truly needs them.
