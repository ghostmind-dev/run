#!/usr/bin/env bash

############################################################################
# ZSH SETUP
############################################################################

git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
sed -i '/plugins=(git)/c\plugins=(git kubectl zsh-autosuggestions gcloud docker)' ~/.zshrc

# ############################################################################
# # NPM SETUP
# ############################################################################

mkdir ${HOME}/.npm-global
echo ${NPMRC_INSTALL} | base64 -di -w 0 >${HOME}/.npmrc
echo ${NPMRC_PUBLISH} | base64 -di -w 0 >${SRC}/.npmrc
npm config set prefix ${HOME}/.npm-global
npm config set update-notifier false

############################################################################
# ADMIN:CORE-CMD DEV SETUP
############################################################################

cd ${SRC}
npm install --loglevel=error --global >/dev/null
npm link @ghostmind-dev/run

# ############################################################################
# # DVC-COMNMAND SETUP FOR LOCAL DEVELOPMENT
# ############################################################################

cat <<EOT >>~/.zshrc
alias run="${SRC}/src/bin/cmd.mjs"
EOT
