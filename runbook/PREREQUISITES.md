# PREREQUISITES.md

Everything you need in place **before** starting `EXECUTION-GUIDE.md`. Go through this top to bottom once; you shouldn't need to come back to it mid-deployment.

## 1. Accounts

- [ ] **AWS account** with admin access (or at minimum: IAM, VPC, EC2, EKS, RDS, ECR, Route53, ACM, Secrets Manager, DynamoDB, S3)
- [ ] **GitHub account**, with 3 repos created (empty is fine, you'll push into them): `employee-task-app`, `employee-task-gitops`, `employee-task-infra`
- [ ] **Domain** `rashmidevops.xyz` registered and its nameservers already pointed at Route53 (this project assumes this is already true — it doesn't create the hosted zone)
- [ ] *(Optional)* **Slack workspace** if you want deploy notifications

## 2. Local tools

Run every command below and confirm you get a version back, not "command not found."

| Tool | Check | Install (macOS example) |
|---|---|---|
| Git | `git --version` | `brew install git` |
| Terraform (>= 1.6) | `terraform -version` | `brew install terraform` |
| Ansible | `ansible --version` | `brew install ansible` |
| AWS CLI | `aws --version` | `brew install awscli` |
| kubectl | `kubectl version --client` | `brew install kubectl` |
| Helm (>= 3.14) | `helm version` | `brew install helm` |
| Docker | `docker --version` | Install Docker Desktop |
| yq | `yq --version` | `brew install yq` |
| jq | `jq --version` | `brew install jq` |
| Node.js 20 | `node --version` | `brew install node@20` |

(Linux: swap `brew install` for your distro's package manager — everything above is in `apt`, `dnf`, etc. under the same or a very similar name.)

## 3. AWS CLI authentication

```bash
aws configure
# AWS Access Key ID, Secret Access Key, region (us-east-1), output format (json)

aws sts get-caller-identity
# Should print your account ID, user ARN — not an error
```

## 4. Verify DNS delegation is actually live

```bash
dig NS rashmidevops.xyz +short
```
Must return AWS nameservers (`ns-....awsdns-....org/com/net/co.uk`), not GoDaddy's. If it doesn't yet, this is the single most common cause of a confusing, slow failure later — the ACM certificate step in the execution guide will hang for up to 20 minutes and then time out if DNS isn't actually delegated yet. Wait for propagation and re-check before starting the execution guide, not after it's already failed.

## 5. An EC2 key pair (for the Jenkins server)

```bash
aws ec2 create-key-pair --key-name employee-task-jenkins-key --query 'KeyMaterial' --output text > ~/.ssh/employee-task-jenkins-key.pem
chmod 400 ~/.ssh/employee-task-jenkins-key.pem
```
Remember this name (`employee-task-jenkins-key`) — you'll pass it to Terraform later.

## 6. Your current public IP

```bash
curl -s https://checkip.amazonaws.com
```
Write this down as `<YOUR_IP>` — you'll restrict SSH/Jenkins-UI access to it. If your IP changes later (different network, ISP renewal), you'll need to update `jenkins_admin_cidr` and re-apply.

## 7. GitHub fine-grained Personal Access Token

Create one now (GitHub → Settings → Developer settings → Fine-grained tokens):
- Repository access: only `employee-task-gitops`
- Permissions: **Contents: Read and write**
- Save the token somewhere — you'll add it as a GitHub Actions secret in the execution guide.

## 8. *(Optional)* Slack incoming webhook

If you want deploy notifications: create a Slack app → enable Incoming Webhooks → add one to a channel. Save the webhook URL.

## 9. A working directory

Pick one parent folder for all 3 repos as siblings. The execution guide assumes:
```
~/projects/employee-task-app
~/projects/employee-task-gitops
~/projects/employee-task-infra
```

```bash
mkdir -p ~/projects && cd ~/projects
git clone https://github.com/rashmiranjandevops/employee-task-app.git
git clone https://github.com/rashmiranjandevops/employee-task-gitops.git
git clone https://github.com/rashmiranjandevops/employee-task-infra.git
```

---

Once every box above is checked, move to **EXECUTION-GUIDE.md**.
