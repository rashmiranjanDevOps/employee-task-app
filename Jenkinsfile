// Jenkinsfile — full CI/CD pipeline for Task Tracker, equivalent to
// .github/workflows/ci-cd.yml. Either pipeline works on its own, end to
// end.
//
// The actual build/test/scan/push/deploy LOGIC lives in scripts/ci/*.sh
// and scripts/notify-slack.sh, shared with the GitHub Actions workflow -
// so the two pipelines can't quietly drift apart on what "passing CI" or
// "deploying" actually means.
//
// IMPORTANT: only enable an auto-trigger (webhook/poll) on ONE of Jenkins
// or GitHub Actions, not both — if both fire on the same push, they'd race
// to push the same commit.
//
// Runs directly on this Jenkins server (`agent any`) — employee-task-infra's
// user-data.sh already installed everything these stages need (docker,
// node 20, aws-cli, trivy, yq, jq) onto the host on boot.
//
// Required Jenkins credentials:
//   - ecr-registry-url      (secret text — e.g. 123456789012.dkr.ecr.us-east-1.amazonaws.com)
//   - aws-ecr-credentials   (AWS access key with ecr:* on the two repos)
//   - github-push-token     (username/password — a GitHub PAT with contents:write on this repo)
//   - slack-webhook-url     (secret text — optional, notify-slack.sh no-ops without it)

pipeline {
  agent any

  environment {
    AWS_REGION   = 'us-east-1'
    ECR_REGISTRY = credentials('ecr-registry-url')
    IMAGE_TAG    = "dev-${env.GIT_COMMIT.take(7)}-${env.BUILD_NUMBER}"
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
      when { branch 'main' }
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

    stage('Deploy: Update image tag') {
      when { branch 'main' }
      steps {
        withCredentials([usernamePassword(credentialsId: 'github-push-token',
                                           usernameVariable: 'GIT_USER',
                                           passwordVariable: 'GIT_TOKEN')]) {
          sh '''
            git remote set-url origin https://$GIT_USER:$GIT_TOKEN@github.com/rashmiranjanDevOps/employee-task-app.git
            ./scripts/ci/update-image-tag.sh $IMAGE_TAG
          '''
        }
      }
    }
  }

  post {
    always {
      sh 'docker logout $ECR_REGISTRY || true'
    }
    success {
      withCredentials([string(credentialsId: 'slack-webhook-url', variable: 'SLACK_WEBHOOK_URL')]) {
        sh './scripts/notify-slack.sh success Deploy dev "image $IMAGE_TAG (build #${BUILD_NUMBER})"'
      }
    }
    failure {
      withCredentials([string(credentialsId: 'slack-webhook-url', variable: 'SLACK_WEBHOOK_URL')]) {
        sh './scripts/notify-slack.sh failure CI dev "build #${BUILD_NUMBER} failed — check the Jenkins stage view"'
      }
    }
  }
}
