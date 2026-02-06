#!/bin/bash

# Usage: ./merge_branch.sh <branch_to_pull> <branch_to_merge_into>

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <branch_to_pull> <branch_to_merge_into>"
    exit 1
fi


branch_to_pull=$1
branch_to_merge_into=$2

# Define the ASCII banner for "Yooo, Merged !!"
banner=(
"                                                                 " 
"███╗   ███╗███████╗██████╗  ██████╗ ███████╗██████╗     ██╗██╗██╗"
"████╗ ████║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔══██╗    ██║██║██║"
"██╔████╔██║█████╗  ██████╔╝██║  ███╗█████╗  ██║  ██║    ██║██║██║"
"██║╚██╔╝██║██╔══╝  ██╔══██╗██║   ██║██╔══╝  ██║  ██║    ╚═╝╚═╝╚═╝"
"██║ ╚═╝ ██║███████╗██║  ██║╚██████╔╝███████╗██████╔╝    ██╗██╗██╗"
"╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═════╝     ╚═╝╚═╝╚═╝"
"                                                                 "
)

# Function to display the banner with animation
show_banner() {
  for line in "${banner[@]}"; do
    echo "$line"
    sleep 0.1
  done
}



git checkout "$branch_to_pull" || exit 1

git pull origin "$branch_to_pull" || exit 1

git checkout "$branch_to_merge_into" || exit 1

git merge "$branch_to_pull" || exit 1

# Call the show_banner function
show_banner
echo "Need to push!"