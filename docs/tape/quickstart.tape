Output ldap-manager-quickstart.gif

Set Shell "zsh"
Set FontSize 15
Set Width 1150
Set Height 560
Set Padding 24
Set Theme "Dracula"
Set TypingSpeed 45ms

Type "# LDAP Manager - pull and run"
Enter
Sleep 500ms

Type "docker run -d --name lm-demo -p 8099:8000 vibhuvioio/ldap-manager:1.1.0"
Enter
Sleep 6s

Type "curl -s localhost:8099/api/auth/status"
Enter
Sleep 2s

Type "docker exec lm-demo ls /app/app/api/"
Enter
Sleep 2s

Type "docker rm -f lm-demo"
Enter
Sleep 1s
