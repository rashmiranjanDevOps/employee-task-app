// Jenkinsfile — full CI/CD pipeline for Task Tracker, equivalent to
// .github/workflows/ci-cd.yml. Either pipeline can be used on its own,
// end to end, without touching the other or the project's architecture —
// see ARCHITECTURE.md.
//
// The actual build/test/scan/push/deploy LOGIC lives in scripts/ci/*.sh and
// scripts/notify-slack.sh, shared with the GitHub Actions workflow. This
// Jenkinsfile is mostly "authenticate, then call the same scripts GitHub
// Actions calls" — so the two pipelines can't quietly drift apart on what
// "passing CI" or "deploying" actually means.
//
// develop branch -> dev. main branch -> prod.
//
// IMPORTANT: only enable an auto-trigger (webhook/poll) on ONE of Jenkins
// or GitHub Actions, not both — if both fire on the same push, they'd race
// to update the GitOps repo. Pick one as your "live" pipeline; the other
// still works if you ever want to switch.
//
// Runs directly on this Jenkins server (`agent any`) — employee-task-infra's
// ansible/jenkins.yml already installed everything these stages need
// (docker, node 20, aws-cli, trivy, yq, jq) straight onto the host, so
// there's no separate agent image to build or keep in sync.
//
// Required Jenkins credentials:
//   - aws-ecr-credentials   (AWS access key with ecr:* on the two repos)
//   - gitops-deploy-key     (SSH key with push access to employee-task-gitops)
//   - slack-webhook-url     (secret text — optional, notify-slack.sh no-ops without it)

pipeline {
  agent any

  environment {
    AWS_REGION   = 'us-east-1'
    ECR_REGISTRY = credentials('ecr-registry-url') // e.g. 123456789012.dkr.ecr.us-east-1.amazonaws.com
    GITOPS_REPO  = 'git@github.com:rashmiranjandevops/employee-task-gitops.git'
    ENVIRONMENT  = "${env.BRANCH_NAME == 'main' ? 'prod' : 'dev'}"
    IMAGE_TAG    = "${env.BRANCH_NAME == 'main' ? 'prod' : 'dev'}-${env.GIT_COMMIT.take(7)}"
  }

  options {
    timeout(time: 30, unit: 'MINUTES')
    disableConcurrentBuilds()
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Test: Backend') {
      steps { sh './scripts/ci/run-checks.sh backend' }
    }

    stage('Test: Frontend') {
      steps { sh './scripts/ci/run-checks.sh frontend' }
    }

    stage('Build, Scan, Push') {
      when { anyOf { branch 'main'; branch 'develop' } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'aws-ecr-credentials',
                                           usernameVariable: 'AWS_ACCESS_KEY_ID',
                                           passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) {
          sh '''
            aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
            ./scripts/ci/build-scan-push.sh $ECR_REGISTRY $IMAGE_TAG
          '''
        }
      }
    }

    stage('Deploy: Update GitOps') {
      when { anyOf { branch 'main'; branch 'develop' } }
      steps {
        sshagent(credentials: ['gitops-deploy-key']) {
          sh '''
            git clone $GITOPS_REPO gitops-repo
            ./scripts/ci/deploy-to-gitops.sh ./gitops-repo $ENVIRONMENT $IMAGE_TAG
          '''
        }
      }
    }
  }

  post {
    always {
      sh 'docker logout $ECR_REGISTRY || true'
      sh 'rm -rf gitops-repo || true'
    }
    success {
      withCredentials([string(credentialsId: 'slack-webhook-url', variable: 'SLACK_WEBHOOK_URL')]) {
        sh './scripts/notify-slack.sh success Deploy "$ENVIRONMENT" "image $IMAGE_TAG (build #${BUILD_NUMBER})"'
      }
    }
    failure {
      withCredentials([string(credentialsId: 'slack-webhook-url', variable: 'SLACK_WEBHOOK_URL')]) {
        sh './scripts/notify-slack.sh failure CI "$ENVIRONMENT" "build #${BUILD_NUMBER} failed — check the Jenkins stage view"'
      }
    }
  }
}
